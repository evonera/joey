import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { replyDrafts } from "./db/schema";

/** An AI result may replace only the exact editable snapshot it read. */
export async function replaceReplyDraftSnapshot(
  tenantId: string,
  snapshot: Pick<typeof replyDrafts.$inferSelect, "id" | "status" | "content" | "feedback">,
  content: string,
  feedback: string | null,
) {
  if (!["pending_review", "failed"].includes(snapshot.status)) return undefined;
  const [updated] = await db.update(replyDrafts)
    .set({ content, feedback, status: "pending_review" })
    .where(and(
      eq(replyDrafts.id, snapshot.id),
      eq(replyDrafts.tenantId, tenantId),
      eq(replyDrafts.status, snapshot.status),
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
      inArray(replyDrafts.status, ["pending_review", "rejected", "failed"]),
    )).returning({ id: replyDrafts.id });
  return approved;
}
