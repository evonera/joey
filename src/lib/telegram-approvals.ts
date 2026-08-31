import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { telegramApprovals, telegramBotInstallations, telegramUpdates } from "@/lib/db/schema";
import { enqueueTelegramMessage } from "@/lib/telegram-outbox";
import { resumeFlowRunInternal } from "@/lib/flows/resume-flow";
import { telegramSenderAllowed, telegramSenderId } from "@/lib/telegram";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const telegramApprovalCallback = (token: string, approve: boolean) => `ja:${token}:${approve ? "1" : "0"}`;
export function parseTelegramApprovalCallback(value: unknown): { token: string; approve: boolean } | null {
  if (typeof value !== "string" || Buffer.byteLength(value) > 64) return null;
  const match = value.match(/^ja:([A-Za-z0-9_-]{24}):([01])$/);
  return match ? { token: match[1], approve: match[2] === "1" } : null;
}

export async function notifyTelegramApproval(input: { tenantId: string; runId: string; prompt: string }) {
  const installation = await db.query.telegramBotInstallations.findFirst({ where: and(eq(telegramBotInstallations.tenantId, input.tenantId), eq(telegramBotInstallations.status, "active")) });
  if (!installation?.allowedUserIds.length) return;
  const token = randomBytes(18).toString("base64url");
  const [approval] = await db.insert(telegramApprovals).values({ tenantId: input.tenantId, installationId: installation.id, runId: input.runId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }).onConflictDoNothing().returning({ id: telegramApprovals.id });
  if (!approval) return;
  const replyMarkup = { inline_keyboard: [[{ text: "Approve", callback_data: telegramApprovalCallback(token, true) }, { text: "Reject", callback_data: telegramApprovalCallback(token, false) }]] };
  await Promise.all(installation.allowedUserIds.map((userId) => enqueueTelegramMessage({ tenantId: input.tenantId, idempotencyKey: `approval:${approval.id}:${userId}`, chatId: String(userId), text: input.prompt, replyMarkup })));
}

export async function processTelegramApprovalUpdates(limit = 20) {
  const updates = await db.query.telegramUpdates.findMany({ where: eq(telegramUpdates.status, "pending"), orderBy: (rows, { asc }) => [asc(rows.createdAt)], limit });
  for (const update of updates) {
    const [updateClaim] = await db.update(telegramUpdates).set({ status: "processing", updatedAt: new Date() }).where(and(eq(telegramUpdates.id, update.id), eq(telegramUpdates.status, "pending"))).returning({ id: telegramUpdates.id });
    if (!updateClaim) continue;
    const callback = (update.payload as Record<string, unknown>).callback_query as Record<string, unknown> | undefined;
    const parsed = parseTelegramApprovalCallback(callback?.data);
    if (!parsed) { await db.update(telegramUpdates).set({ status: "ignored", processedAt: new Date(), updatedAt: new Date() }).where(and(eq(telegramUpdates.id, update.id), eq(telegramUpdates.status, "processing"))); continue; }
    const installation = await db.query.telegramBotInstallations.findFirst({ where: eq(telegramBotInstallations.id, update.installationId) });
    const senderId = telegramSenderId(update.payload as Record<string, unknown>);
    if (!installation || !telegramSenderAllowed(installation.allowedUserIds, senderId)) { await db.update(telegramUpdates).set({ status: "forbidden", processedAt: new Date(), updatedAt: new Date() }).where(and(eq(telegramUpdates.id, update.id), eq(telegramUpdates.status, "processing"))); continue; }
    const [claimed] = await db.update(telegramApprovals).set({ status: "claimed", decision: parsed.approve, decidedByTelegramUserId: senderId, decidedAt: new Date(), updatedAt: new Date() }).where(and(eq(telegramApprovals.installationId, installation.id), eq(telegramApprovals.tokenHash, tokenHash(parsed.token)), eq(telegramApprovals.status, "pending"), gt(telegramApprovals.expiresAt, new Date()))).returning({ id: telegramApprovals.id, tenantId: telegramApprovals.tenantId, runId: telegramApprovals.runId });
    if (!claimed) { await db.update(telegramUpdates).set({ status: "duplicate", processedAt: new Date(), updatedAt: new Date() }).where(and(eq(telegramUpdates.id, update.id), eq(telegramUpdates.status, "processing"))); continue; }
    const result = await resumeFlowRunInternal(claimed.tenantId, claimed.runId, parsed.approve);
    await db.update(telegramApprovals).set({ status: result.ok ? "completed" : "failed", updatedAt: new Date() }).where(and(eq(telegramApprovals.id, claimed.id), eq(telegramApprovals.status, "claimed")));
    await db.update(telegramUpdates).set({ status: result.ok ? "processed" : "failed", error: result.error ?? null, processedAt: new Date(), updatedAt: new Date() }).where(and(eq(telegramUpdates.id, update.id), eq(telegramUpdates.status, "processing")));
  }
}
