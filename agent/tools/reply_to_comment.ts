import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { replyDrafts, engagementItems, agentConfigs } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

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
    if (typeof tenantId !== "string") {
      throw new Error("Invalid tenant identity in session auth.");
    }

    const item = await db.query.engagementItems.findFirst({
      where: and(
        eq(engagementItems.id, engagementItemId),
        eq(engagementItems.tenantId, tenantId),
      ),
    });
    if (!item) {
      throw new Error(`Engagement item ${engagementItemId} not found.`);
    }
    const existing = await db.query.replyDrafts.findFirst({
      where: and(
        eq(replyDrafts.tenantId, tenantId),
        eq(replyDrafts.engagementItemId, engagementItemId),
        inArray(replyDrafts.status, ["pending_review", "approved", "sending", "failed"]),
      ),
    });
    if (existing) {
      if (existing.status !== "pending_review" && existing.status !== "failed") {
        return { success: true, replyDraftId: existing.id, message: "An active reply draft already exists." };
      }
      await db.update(replyDrafts)
        .set({ content, feedback: tone || null, status: "pending_review" })
        .where(and(eq(replyDrafts.id, existing.id), eq(replyDrafts.tenantId, tenantId)));
      return { success: true, replyDraftId: existing.id, message: "Existing reply draft updated." };
    }

    const [draft] = await db.insert(replyDrafts).values({
      tenantId,
      engagementItemId,
      content,
      status: "pending_review",
    }).onConflictDoNothing().returning();

    if (!draft) {
      const concurrentlyCreated = await db.query.replyDrafts.findFirst({
        where: and(
          eq(replyDrafts.tenantId, tenantId),
          eq(replyDrafts.engagementItemId, engagementItemId),
          inArray(replyDrafts.status, ["pending_review", "approved", "sending", "failed"]),
        ),
      });
      if (!concurrentlyCreated) {
        throw new Error("Reply draft could not be created.");
      }
      return {
        success: true,
        replyDraftId: concurrentlyCreated.id,
        message: "A concurrent reply draft already exists.",
      };
    }

    const { createNotification } = await import('@/lib/notifications');
    await createNotification(tenantId, 'engagement_reply_needed', 'Comment Needs Reply', 'Your AI agent has drafted a reply to a comment for your review.', { link: '/engagement' });

    return { success: true, replyDraftId: draft.id, message: "Reply draft saved for review." };
  },
});
