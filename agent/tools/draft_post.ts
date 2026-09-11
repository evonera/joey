import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { drafts, socialAccounts } from "@/lib/db/schema";

import { and, eq, inArray } from "drizzle-orm";
import { manualPostSchema } from "@/lib/compose-validation";

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
      if (scheduledFor && (!Number.isFinite(Date.parse(scheduledFor)) || Date.parse(scheduledFor) <= Date.now())) {
        return { error: "Choose a future scheduled time in ISO-8601 format." };
      }
      const validScheduledDate = scheduledFor ? new Date(scheduledFor) : null;
      const accounts = await db.query.socialAccounts.findMany({
        where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true),
          inArray(socialAccounts.platform, canonicalPlatform === "x" ? ["x", "twitter"] : [canonicalPlatform])),
      });
      const requestedIds = [...new Set(accountIds || [])];
      const selected = requestedIds.length ? accounts.filter(account => requestedIds.includes(account.id)) : accounts;
      if (requestedIds.length && selected.length !== requestedIds.length) return { error: "Choose active accounts from this workspace matching the draft platform." };
      if (!requestedIds.length && selected.length > 1) return { error: "Multiple accounts match this platform. Ask which account to use and pass its account ID." };
      if (!selected.length) return { error: "Connect an account in Settings first, or provide the draft text directly in chat." };
      const validation = manualPostSchema.safeParse({ content: resolvedContent, mediaUrls: mediaUrls || [], accountIds: selected.map(account => account.id), scheduleType: "draft" });
      if (!validation.success) return { error: validation.error.issues[0]?.message || "Invalid draft" };
      const saved = await db.insert(drafts).values(selected.map(account => ({
        tenantId,
        content: resolvedContent,
        variants: resolvedVariants,
        platformOptions: { platform: canonicalPlatform, accountId: account.id, mediaUrls: mediaUrls || [], source: "chat" },
        scheduledFor: validScheduledDate,
        status: "pending_review",
      }))).returning();

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
        message: `Draft successfully created and queued for review${validScheduledDate ? ` (proposed time ${validScheduledDate.toISOString()}; approval is still required)` : ""}.`,
      };
    } catch (error: any) {
      console.error("[draft_post] Error saving draft:", error);
      return { error: `Failed to save draft: ${error.message || error}` };
    }
  },
});
