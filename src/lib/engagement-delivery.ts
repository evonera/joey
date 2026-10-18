import { and, eq, isNull, lte, or, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { replyDrafts, engagementItems, socialAccounts, agentConfigs } from "@/lib/db/schema";

export const ENGAGEMENT_SEND_LEASE_MS = 10 * 60_000;

/**
 * Marks expired sends for reconciliation without making their payload editable.
 * A timeout cannot prove the provider rejected a public reply.
 */
export async function recoverStaleEngagementSends(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ENGAGEMENT_SEND_LEASE_MS);
  const recovered = await db
    .update(replyDrafts)
    .set({ status: "failed", sendClaimedAt: sql`coalesce(${replyDrafts.sendClaimedAt}, ${now.toISOString()}::timestamp)` })
    .where(and(
      eq(replyDrafts.status, "sending"),
      or(
        isNull(replyDrafts.sendClaimedAt),
        lte(replyDrafts.sendClaimedAt, cutoff),
      ),
    ))
    .returning({ id: replyDrafts.id });

  return recovered.length;
}

/** Caller authorizes the tenant; all external effects occur after an immutable claim. */
export async function sendApprovedReply(
  tenantId: string,
  replyDraftId: string,
  resolveClient: typeof import("./zernio-session").getZernioClient,
) {
    // Claim the approved draft before performing the external side effect. This
    // compare-and-swap prevents double clicks and concurrent workers from sending
    // the same reply more than once.
    const [draft] = await db.update(replyDrafts)
      .set({ status: "sending", sendClaimedAt: new Date() })
      .where(and(
        eq(replyDrafts.id, replyDraftId),
        eq(replyDrafts.tenantId, tenantId),
        eq(replyDrafts.status, "approved"),
        isNull(replyDrafts.sendClaimedAt),
      ))
      .returning();
    if (!draft) return { error: "Reply must be approved and not already sending" };

    let providerAttempted = false;
    try {
      const item = await db.query.engagementItems.findFirst({
      where: and(
        eq(engagementItems.id, draft.engagementItemId),
        eq(engagementItems.tenantId, tenantId),
      ),
    });
    if (!item) {
      await db.update(replyDrafts)
          .set({ status: providerAttempted ? "failed" : "pending_review", sendClaimedAt: providerAttempted ? draft.sendClaimedAt : null })
        .where(and(
          eq(replyDrafts.id, replyDraftId),
          eq(replyDrafts.tenantId, tenantId),
          eq(replyDrafts.status, "sending"),
          eq(replyDrafts.sendClaimedAt, draft.sendClaimedAt!),
        ));
      return { error: "Engagement item not found" };
    }

      const priorSent = await db.query.replyDrafts.findFirst({ where: and(
        eq(replyDrafts.tenantId, tenantId), eq(replyDrafts.engagementItemId, item.id), eq(replyDrafts.status, "sent"),
      ) });
      if (item.status === "replied" || priorSent) throw new Error("This comment already has a sent reply. No additional reply was sent.");
      const { zernio } = await resolveClient();

      const account = await db.query.socialAccounts.findFirst({
      where: and(
        eq(socialAccounts.tenantId, tenantId),
        item.socialAccountId
          ? eq(socialAccounts.id, item.socialAccountId)
          : eq(socialAccounts.platform, item.platform),
      ),
    });
      if (!account) throw new Error(`No connected account found for ${item.platform}`);

      const platformPostId = item.metadata as any;
      const postId = item.platformPostId || platformPostId?.comment?.postId;
      if (!postId) throw new Error("No post ID available for reply");

      providerAttempted = true;
      const response = await zernio.comments.replyToInboxPost({
        path: { postId },
        headers: { "Idempotency-Key": `engagement-reply:${replyDraftId}` },
        body: {
          accountId: account.platformAccountId,
          message: draft.content,
          ...(item.platformCommentId ? { commentId: item.platformCommentId } : {}),
        },
      });

      if (response.error) throw response.error;

      await db.transaction(async (tx) => {
        // Draft creation and delivery completion share the parent-first order.
        await tx.select({ id: engagementItems.id }).from(engagementItems)
          .where(and(eq(engagementItems.id, item.id), eq(engagementItems.tenantId, tenantId))).for("update");
        const [completed] = await tx.update(replyDrafts)
          .set({ status: "sent", sentAt: new Date(), sendClaimedAt: null })
          .where(and(
            eq(replyDrafts.id, replyDraftId),
            eq(replyDrafts.tenantId, tenantId),
            inArray(replyDrafts.status, ["sending", "failed"]),
            eq(replyDrafts.sendClaimedAt, draft.sendClaimedAt!),
          )).returning({ id: replyDrafts.id });
        if (!completed) throw new Error("Reply delivery changed; check the provider before retrying.");

        await tx.update(engagementItems)
          .set({ status: "replied" })
          .where(and(
            eq(engagementItems.id, item.id),
            eq(engagementItems.tenantId, tenantId),
          ));
      });

      return { success: true };
    } catch (error: any) {
      const status = error?.status || error?.response?.status;
      await db.update(replyDrafts)
        .set({ status: providerAttempted ? "failed" : "pending_review", sendClaimedAt: providerAttempted ? draft.sendClaimedAt : null })
        .where(and(
          eq(replyDrafts.id, replyDraftId),
          eq(replyDrafts.tenantId, tenantId),
          eq(replyDrafts.status, "sending"),
          eq(replyDrafts.sendClaimedAt, draft.sendClaimedAt!),
        ));

      if (status === 401 || status === 403) {
        try {
          await db.update(agentConfigs)
            .set({ isPaused: true, pauseReason: "api_failure" })
            .where(eq(agentConfigs.tenantId, tenantId));
        } catch (pauseError) {
          console.error("Failed to pause agent after Zernio authorization error:", pauseError);
        }
      }

      return { error: providerAttempted ? "Reply delivery is uncertain. Check the connected account before making changes; contact support for reconciliation." : error?.message || "Failed to send reply" };
    }
}
