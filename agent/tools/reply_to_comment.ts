import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { replyDrafts, engagementItems, agentConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default defineTool({
  description:
    "Draft a reply to an inbound social media comment or mention. Use this when a comment needs a response. Saves the draft for user review before sending.",
  inputSchema: z.object({
    engagementItemId: z.string().describe("The ID of the engagement item (comment/mention) to reply to."),
    content: z.string().describe("The reply text to send. Must be on-brand and appropriate for the platform."),
    tone: z.string().optional().describe("Optional tone hint, e.g. 'friendly', 'professional', 'humorous'."),
  }),
  execute: async ({ engagementItemId, content, tone }, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    if (!tenantId) {
      throw new Error("Unable to identify tenant from session auth.");
    }

    const item = await db.query.engagementItems.findFirst({
      where: eq(engagementItems.id, engagementItemId),
    });
    if (!item) {
      throw new Error(`Engagement item ${engagementItemId} not found.`);
    }
    if (item.tenantId !== tenantId) {
      throw new Error("Engagement item does not belong to this tenant.");
    }

    const existing = await db.query.replyDrafts.findFirst({
      where: eq(replyDrafts.engagementItemId, engagementItemId),
    });
    if (existing && existing.status === "pending_review") {
      await db.update(replyDrafts)
        .set({ content, feedback: tone || null })
        .where(eq(replyDrafts.id, existing.id));
      return { success: true, replyDraftId: existing.id, message: "Existing reply draft updated." };
    }

    const [draft] = await db.insert(replyDrafts).values({
      tenantId: tenantId as string,
      engagementItemId,
      content,
      status: "pending_review",
    }).returning();

    const { createNotification } = await import('@/app/actions/notifications');
    await createNotification(tenantId as string, 'engagement_reply_needed', 'Comment Needs Reply', 'Your AI agent has drafted a reply to a comment for your review.', { link: '/engagement' });

    return { success: true, replyDraftId: draft.id, message: "Reply draft saved for review." };
  },
});