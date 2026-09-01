import crypto from "crypto";
import { db } from "@/lib/db";
import { webhookEvents, socialAccounts, flowRuns } from "@/lib/db/schema";
import { eq, and, sql, gt } from "drizzle-orm";

export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const computedBuf = Buffer.from(computed);
  const signatureBuf = Buffer.from(signature);
  if (computedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(computedBuf, signatureBuf);
}

export type ZernioWebhookPayload = {
  id: string;
  event: string;
  timestamp: string;
  [key: string]: unknown;
};

export async function storeWebhookEvent(payload: ZernioWebhookPayload) {
  // Atomic dedup: rely on the unique event_id index. Concurrent deliveries
  // with the same id both try to insert; the loser is caught by
  // onConflictDoNothing and acknowledged as a duplicate — never a 500.
  const [event] = await db
    .insert(webhookEvents)
    .values({
      eventId: payload.id,
      eventType: payload.event,
      payload,
      status: "pending",
    })
    .onConflictDoNothing({ target: webhookEvents.eventId })
    .returning();

  if (!event) {
    const existing = await db.query.webhookEvents.findFirst({
      where: eq(webhookEvents.eventId, payload.id),
    });
    if (!existing) return { event: null, isDuplicate: true };

    if (existing.status === "failed") {
      // Re-arm failed webhook for retry
      const [rearmed] = await db
        .update(webhookEvents)
        .set({
          status: "pending",
          errorMessage: null,
          processedAt: null,
          payload,
          createdAt: new Date(),
        })
        .where(and(eq(webhookEvents.id, existing.id), eq(webhookEvents.status, "failed")))
        .returning();
      if (rearmed) {
        return { event: rearmed, isDuplicate: false };
      }
    } else if (existing.status === "pending" || existing.status === "processing") {
      // Check if there is an active flow execution emitting live heartbeats
      const recentLiveRun = await db.query.flowRuns.findFirst({
        where: and(
          eq(flowRuns.trigger, "webhook"),
          sql`${flowRuns.triggerPayload}->>'id' = ${String(payload.id)}`,
          eq(flowRuns.status, "running"),
          gt(flowRuns.updatedAt, new Date(Date.now() - 60_000)),
        ),
      });

      // If active flow is running with live heartbeats, do not re-arm or duplicate
      if (recentLiveRun) {
        return { event: existing, isDuplicate: true };
      }

      // If pending/processing for >60s without any live heartbeat, previous process crashed.
      // Exclusively claim the retry via compare-and-swap on createdAt so concurrent deliveries do not duplicate.
      const staleCutoff = new Date(Date.now() - 60_000);
      if (existing.createdAt < staleCutoff) {
        const [rearmed] = await db
          .update(webhookEvents)
          .set({
            status: "pending",
            errorMessage: null,
            processedAt: null,
            payload,
            createdAt: new Date(),
          })
          .where(
            and(
              eq(webhookEvents.id, existing.id),
              eq(webhookEvents.createdAt, existing.createdAt),
            ),
          )
          .returning();
        if (rearmed) {
          return { event: rearmed, isDuplicate: false };
        }
      }

      return { event: existing, isDuplicate: true };
    }

    return { event: existing, isDuplicate: true };
  }
  return { event, isDuplicate: false };
}

export async function markWebhookProcessed(eventId: string, error?: string, expectedCreatedAt?: Date) {
  await db.update(webhookEvents)
    .set({
      status: error ? "failed" : "processed",
      processedAt: new Date(),
      errorMessage: error,
    })
    .where(
      and(
        eq(webhookEvents.eventId, eventId),
        expectedCreatedAt ? eq(webhookEvents.createdAt, expectedCreatedAt) : undefined,
      ),
    );
}

export async function resolveTenantFromPayload(payload: ZernioWebhookPayload): Promise<string | null> {
  const account = (payload as any).account;
  const accountId = account?.accountId || account?.id;
  if (!accountId) return null;

  const socialAccount = await db.query.socialAccounts.findFirst({
    where: eq(socialAccounts.platformAccountId, String(accountId)),
  });
  return socialAccount?.tenantId ?? null;
}
