import crypto from "crypto";
import { db } from "@/lib/db";
import { webhookEvents, socialAccounts, engagementItems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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
  const existing = await db.query.webhookEvents.findFirst({
    where: eq(webhookEvents.eventId, payload.id),
  });
  if (existing) return { event: existing, isDuplicate: true };

  const [event] = await db.insert(webhookEvents).values({
    eventId: payload.id,
    eventType: payload.event,
    payload,
    status: "pending",
  }).returning();

  return { event, isDuplicate: false };
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

export async function storeEngagementItem(payload: ZernioWebhookPayload, tenantId: string) {
  const data = payload as any;
  const comment = data.comment || data.mention || {};
  const account = data.account || {};

  // Dedup by platform comment id (or webhook event id) scoped by tenant
  const existing = await db.query.engagementItems.findFirst({
    where: and(
      eq(engagementItems.tenantId, tenantId),
      eq(engagementItems.platformCommentId, comment.id || payload.id)
    ),
  });
  if (existing) return existing;

  const eventType = payload.event; // 'comment.received' or 'message.received'

  if (eventType !== "comment.received") return null;

  const [item] = await db.insert(engagementItems).values({
    tenantId,
    platform: account.platform || data.platform || "unknown",
    platformPostId: comment.postId || comment.mediaId,
    platformCommentId: comment.id || payload.id,
    commenterName: comment.fromName || comment.username,
    commenterHandle: comment.fromHandle || comment.fromUsername,
    commenterAvatar: comment.fromAvatar,
    text: comment.text || comment.message || "",
    type: "comment",
    status: "pending",
    metadata: payload as any,
  }).returning();

  return item;
}
