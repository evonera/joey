import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { drafts } from "@/lib/db/schema";

export default defineTool({
  description: "Save a generated social media draft or scheduled post for the user to review. Use this when the user asks to create, draft, or schedule social media posts.",
  inputSchema: z.object({
    platform: z.string().describe("The social media platform this draft is intended for (e.g., 'twitter'/'x', 'instagram', 'linkedin', 'facebook', 'pinterest', 'bluesky')."),
    content: z.string().optional().describe("The main post text content."),
    variants: z.array(z.object({
      name: z.string().describe("The name of the variant (e.g., 'Concise', 'Bold', 'Data-Driven')."),
      content: z.string().describe("The content of the variant."),
    })).optional().describe("Optional array of distinct variants of the post."),
    accountIds: z.array(z.string()).optional().describe("Optional array of specific connected social account IDs to post to."),
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
    if (!resolvedContent.trim()) {
      return { error: "Draft content cannot be empty." };
    }

    const resolvedVariants = variants && variants.length > 0
      ? variants
      : [
          { name: "Original", content: resolvedContent },
          { name: "Punchy", content: resolvedContent.slice(0, 200) },
        ];

    try {
      const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
      const validScheduledDate = scheduledDate && !isNaN(scheduledDate.getTime()) ? scheduledDate : null;

      const [draft] = await db.insert(drafts).values({
        tenantId,
        content: resolvedContent,
        variants: resolvedVariants,
        platformOptions: {
          platform: canonicalPlatform,
          accountIds: accountIds || [],
          mediaUrls: mediaUrls || [],
        },
        scheduledFor: validScheduledDate,
        status: "pending_review",
      }).returning();

      // Record token usage estimate
      try {
        const { recordTokenUsage } = await import("@/lib/usage");
        const totalChars = resolvedVariants.reduce((n, v) => n + v.content.length, 0);
        const outputTokens = Math.ceil(totalChars / 4) || 200;
        await recordTokenUsage(tenantId, 1500, outputTokens);
      } catch (usageErr) {
        console.warn("[draft_post] Failed to record token usage:", usageErr);
      }

      // Send in-app notification
      try {
        const { createNotification } = await import("@/lib/notifications");
        const scheduleNotice = validScheduledDate ? ` scheduled for ${validScheduledDate.toLocaleString()}` : "";
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
        draftId: draft?.id,
        platform: canonicalPlatform,
        scheduledFor: validScheduledDate?.toISOString() ?? null,
        message: `Draft successfully created and queued for review${validScheduledDate ? ` (scheduled for ${validScheduledDate.toISOString()})` : ""}.`,
      };
    } catch (error: any) {
      console.error("[draft_post] Error saving draft:", error);
      return { error: `Failed to save draft: ${error.message || error}` };
    }
  },
});
