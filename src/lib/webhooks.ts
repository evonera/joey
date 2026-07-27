import crypto from "crypto";
import { db } from "@/lib/db";
import { webhookEvents, socialAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

export type ZernioWebhookPayload = {
  id: string;
  event: string;
  timestamp: string;
  [key: string]: unknown;
};

export async function storeWebhookEvent(payload: ZernioWebhookPayload) {
  const existing = await db.query.webhookEvents.findFirst({
    where: eq(webhookEvents.eventId, payload.id),
  });
  if (existing) return existing;

  const [event] = await db.insert(webhookEvents).values({
    eventId: payload.id,
    eventType: payload.event,
    payload,
    status: "pending",
  }).returning();

  return event;
}

export async function markWebhookProcessed(eventId: string, error?: string) {
  await db.update(webhookEvents)
    .set({
      status: error ? "failed" : "processed",
      processedAt: new Date(),
      errorMessage: error,
    })
    .where(eq(webhookEvents.eventId, eventId));
}

export async function resolveTenantFromPayload(payload: ZernioWebhookPayload): Promise<string | null> {
  const account = (payload as any).account;
  if (!account?.id) return null;

  const socialAccount = await db.query.socialAccounts.findFirst({
    where: eq(socialAccounts.platformAccountId, account.id),
  });
  return socialAccount?.tenantId ?? null;
}
