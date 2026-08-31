import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { replyDrafts } from "@/lib/db/schema";

export const ENGAGEMENT_SEND_LEASE_MS = 10 * 60_000;

/**
 * Releases send claims whose worker disappeared before it could persist a
 * terminal state. The outbound request uses a stable idempotency key, so a
 * later explicit retry cannot duplicate a remotely accepted reply.
 */
export async function recoverStaleEngagementSends(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ENGAGEMENT_SEND_LEASE_MS);
  const recovered = await db
    .update(replyDrafts)
    .set({ status: "failed", sendClaimedAt: null })
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
