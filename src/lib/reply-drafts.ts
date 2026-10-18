import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { replyDrafts, engagementItems } from "./db/schema";

/** An AI result may replace only the exact editable snapshot it read. */
export async function replaceReplyDraftSnapshot(
  tenantId: string,
  snapshot: Pick<typeof replyDrafts.$inferSelect, "id" | "status" | "content" | "feedback">,
  content: string,
  feedback: string | null,
) {
  if (!["pending_review"].includes(snapshot.status)) return undefined;
  const [updated] = await db.update(replyDrafts)
    .set({ content, feedback, status: "pending_review" })
    .where(and(
      eq(replyDrafts.id, snapshot.id),
      eq(replyDrafts.tenantId, tenantId),
      eq(replyDrafts.status, snapshot.status),
      isNull(replyDrafts.sendClaimedAt),
      eq(replyDrafts.content, snapshot.content),
      snapshot.feedback === null ? isNull(replyDrafts.feedback) : eq(replyDrafts.feedback, snapshot.feedback),
    )).returning({ id: replyDrafts.id });
  return updated;
}

/** Approve the content the human actually reviewed, never a newer AI result. */
export async function approveReviewedReply(tenantId: string, id: string, expectedContent: string) {
  const [approved] = await db.update(replyDrafts).set({ status: "approved" })
    .where(and(
      eq(replyDrafts.id, id),
      eq(replyDrafts.tenantId, tenantId),
      eq(replyDrafts.content, expectedContent),
      isNull(replyDrafts.sendClaimedAt),
      inArray(replyDrafts.status, ["pending_review", "rejected"]),
    )).returning({ id: replyDrafts.id });
  return approved;
}

/** Human edits must never change a payload whose remote outcome is unknown. */
export async function editUnsentReply(tenantId: string, id: string, content: string) {
  const [updated] = await db.update(replyDrafts).set({ content })
    .where(and(eq(replyDrafts.id, id), eq(replyDrafts.tenantId, tenantId),
      isNull(replyDrafts.sendClaimedAt), inArray(replyDrafts.status, ["pending_review", "rejected"])))
    .returning({ id: replyDrafts.id });
  return updated;
}

/** Serialize new AI drafts with other drafts and send completion for this comment. */
export async function draftReplyForItem(tenantId: string, engagementItemId: string, content: string, feedback: string | null) {
  return db.transaction(async tx => {
    const [item] = await tx.select().from(engagementItems)
      .where(and(eq(engagementItems.id, engagementItemId), eq(engagementItems.tenantId, tenantId))).for("update");
    if (!item) throw new Error(`Engagement item ${engagementItemId} not found.`);
    const candidates = await tx.select().from(replyDrafts).where(and(
      eq(replyDrafts.tenantId, tenantId), eq(replyDrafts.engagementItemId, engagementItemId),
      inArray(replyDrafts.status, ["pending_review", "approved", "sending", "failed", "sent"]),
    ));
    const sent = candidates.find(reply => reply.status === "sent");
    if (item.status === "replied" || sent) return { success: false, replyDraftId: sent?.id, message: "This comment already has a sent reply. No additional draft was created." };
    const existing = candidates[0];
    if (existing) {
      if (existing.sendClaimedAt || existing.status !== "pending_review") {
        return { success: false, replyDraftId: existing.id, message: existing.sendClaimedAt || existing.status === "failed" ? "This reply has a pending or uncertain delivery. Check the provider before making changes." : "An approved reply already exists." };
      }
      const [updated] = await tx.update(replyDrafts).set({ content, feedback, status: "pending_review" })
        .where(and(eq(replyDrafts.id, existing.id), eq(replyDrafts.tenantId, tenantId),
          eq(replyDrafts.status, existing.status), isNull(replyDrafts.sendClaimedAt),
          eq(replyDrafts.content, existing.content), existing.feedback === null ? isNull(replyDrafts.feedback) : eq(replyDrafts.feedback, existing.feedback)))
        .returning({ id: replyDrafts.id });
      return updated ? { success: true, replyDraftId: updated.id, message: "Existing reply draft updated." } : { success: false, replyDraftId: existing.id, message: "Reply changed during drafting. Reload it for review; no content was replaced." };
    }
    const [draft] = await tx.insert(replyDrafts).values({ tenantId, engagementItemId, content, feedback, status: "pending_review" }).returning();
    return { success: true, replyDraftId: draft.id, created: true, message: "Reply draft saved for review." };
  });
}
