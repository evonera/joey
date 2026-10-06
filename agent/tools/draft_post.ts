import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { drafts, socialAccounts, customAgents, customAgentAccounts } from "@/lib/db/schema";

import { and, eq, inArray, sql } from "drizzle-orm";
import { manualPostSchema } from "@/lib/compose-validation";
import { agencyProfileForSession } from "../lib/agency-session";
import { requireWorkspaceRole } from "../lib/require-workspace-role";

export default defineTool({
  description: "Save a generated social media draft or scheduled post for the user to review. Use this when the user asks to create, draft, or schedule social media posts.",
  inputSchema: z.object({
    platform: z.enum(["x", "twitter", "instagram", "tiktok", "youtube", "threads", "linkedin", "facebook", "pinterest", "bluesky"]).describe("The social media platform this draft is intended for (e.g., 'twitter'/'x', 'instagram', 'linkedin', 'facebook', 'pinterest', 'bluesky')."),
    content: z.string().optional().describe("The main post text content."),
    variants: z.array(z.object({
      name: z.string().describe("The name of the variant (e.g., 'Concise', 'Bold', 'Data-Driven')."),
      content: z.string().describe("The content of the variant."),
    })).optional().describe("Optional array of distinct variants of the post."),
    accountIds: z.array(z.string()).max(30).optional().describe("Optional array of specific connected social account IDs to post to."),
    scheduledFor: z.string().optional().describe("Optional ISO-8601 date string when this post should be published (e.g., '2026-09-06T09:00:00Z')."),
    mediaUrls: z.array(z.string()).optional().describe("Optional array of media or image URLs attached to the post."),
  }),
  execute: async ({ platform, content, variants, accountIds, scheduledFor, mediaUrls }, ctx) => {
    const tenantId = ctx.session?.auth?.current?.attributes?.tenantId as string | undefined;

    if (!tenantId) {
      return { error: "Unable to identify tenant from session auth. Please sign in." };
    }

    const cleanPlatform = platform?.trim().toLowerCase();
    const canonicalPlatform = cleanPlatform === "twitter" ? "x" : cleanPlatform;

    // Ensure at least one form of content exists
    const resolvedContent = content || variants?.[0]?.content || "";
    if (!resolvedContent.trim() && !mediaUrls?.length) {
      return { error: "Draft content cannot be empty." };
    }

    const resolvedVariants = variants && variants.length > 0
      ? variants
      : [
          { name: "Original", content: resolvedContent },
        ];

    try {
      await requireWorkspaceRole(ctx.session.auth.current, ["owner", "admin", "editor", "member"]);
      const profile = await agencyProfileForSession(ctx.session);
      if (profile && scheduledFor) return { error: "This agent saves unscheduled drafts only. Schedule after owner/admin review in the workspace." };
      if (scheduledFor && (!Number.isFinite(Date.parse(scheduledFor)) || Date.parse(scheduledFor) <= Date.now())) {
        return { error: "Choose a future scheduled time in ISO-8601 format." };
      }
      const validScheduledDate = scheduledFor ? new Date(scheduledFor) : null;
      const workspaceAccounts = await db.query.socialAccounts.findMany({
        where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true),
          inArray(socialAccounts.platform, canonicalPlatform === "x" ? ["x", "twitter"] : [canonicalPlatform])),
      });
      const accounts = profile ? workspaceAccounts.filter(account => profile.accountIds.includes(account.id)) : workspaceAccounts;
      if (profile && !accounts.length) return { error: "No active bound account matches this platform. Update the agent's destination in its settings." };
      const requestedIds = [...new Set(accountIds || [])];
      const selected = requestedIds.length ? accounts.filter(account => requestedIds.includes(account.id)) : accounts;
      if (requestedIds.length && selected.length !== requestedIds.length) return { error: "Choose active accounts from this workspace matching the draft platform." };
      if (!requestedIds.length && selected.length > 1) return { error: "Multiple accounts match this platform. Ask which account to use and pass its account ID." };
      if (!selected.length && scheduledFor) return { error: "Connect a publishing account before scheduling. I can save this as an unscheduled draft now." };
      const validation = manualPostSchema.safeParse({ content: resolvedContent, mediaUrls: mediaUrls || [], accountIds: selected.map(account => account.id), scheduleType: "draft" });
      if (!validation.success) return { error: validation.error.issues[0]?.message || "Invalid draft" };
      const targets: Array<typeof selected[number] | null> = selected.length ? selected : [null];
      const values = targets.map(account => ({
        tenantId,
        content: resolvedContent,
        variants: resolvedVariants,
        platformOptions: { platform: canonicalPlatform, ...(account ? { accountId: account.id } : {}), mediaUrls: mediaUrls || [], source: "chat", ...(profile ? { customAgentId: profile.id, agentConfigVersion: profile.configVersion } : {}) },
        scheduledFor: validScheduledDate,
        status: account ? "pending_review" : "draft",
      }));
      const saved = profile ? await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agency:${tenantId}`}))`);
        const current = await tx.query.customAgents.findFirst({ where: and(eq(customAgents.tenantId, tenantId), eq(customAgents.id, profile.id)) });
        if (!current || current.state === "archived" || current.configVersion !== profile.configVersion) throw new Error("Agent configuration changed. Start a new conversation.");
        const bound = await tx.query.customAgentAccounts.findMany({ where: and(eq(customAgentAccounts.tenantId, tenantId), eq(customAgentAccounts.agentId, profile.id)) });
        if (selected.some(account => !bound.some(binding => binding.accountId === account.id))) throw new Error("Agent destination changed.");
        if (selected.length) {
          const active = await tx.query.socialAccounts.findMany({ where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true), inArray(socialAccounts.id, selected.map(account => account.id))) });
          if (active.length !== selected.length) throw new Error("Agent destination was disconnected. Update its settings.");
        }
        return tx.insert(drafts).values(values).returning();
      }) : await db.insert(drafts).values(values).returning();

      // Send in-app notification
      try {
        const { createNotification } = await import("@/lib/notifications");
        const scheduleNotice = validScheduledDate ? ` proposed for ${validScheduledDate.toLocaleString()}, awaiting review` : "";
        await createNotification(
          tenantId,
          "draft_ready",
          "New Draft Ready",
          `Joey drafted a ${canonicalPlatform.toUpperCase()} post${scheduleNotice}.`,
          { link: "/drafts" }
        );
      } catch (notifErr) {
        console.warn("[draft_post] Failed to send notification:", notifErr);
      }

      return {
        success: true,
        draftId: saved[0]?.id,
        draftIds: saved.map(draft => draft.id),
        url: "/drafts",
        platform: canonicalPlatform,
        scheduledFor: validScheduledDate?.toISOString() ?? null,
        message: selected.length
          ? `Draft saved for review${validScheduledDate ? ` (proposed time ${validScheduledDate.toISOString()}; approval is still required)` : ""}.`
          : "Draft saved without a connected account. Choose a destination when you are ready to publish.",
      };
    } catch (error: any) {
      console.error("[draft_post] Error saving draft:", error);
      return { error: `Failed to save draft: ${error.message || error}` };
    }
  },
});
