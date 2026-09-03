import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
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
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
  const hash = tokenHash(token);

  const approval = await db.transaction(async (tx) => {
    const existing = await tx.query.telegramApprovals.findFirst({
      where: and(eq(telegramApprovals.runId, input.runId), eq(telegramApprovals.tenantId, input.tenantId), eq(telegramApprovals.status, "pending")),
    });
    if (existing) {
      const [updated] = await tx
        .update(telegramApprovals)
        .set({ tokenHash: hash, expiresAt, updatedAt: new Date() })
        .where(and(eq(telegramApprovals.id, existing.id), eq(telegramApprovals.tenantId, input.tenantId)))
        .returning();
      return updated;
    }
    const [inserted] = await tx
      .insert(telegramApprovals)
      .values({ tenantId: input.tenantId, installationId: installation.id, runId: input.runId, tokenHash: hash, expiresAt })
      .returning();
    return inserted;
  });

  if (!approval) return;
  const replyMarkup = { inline_keyboard: [[{ text: "Approve", callback_data: telegramApprovalCallback(token, true) }, { text: "Reject", callback_data: telegramApprovalCallback(token, false) }]] };
  await Promise.all(
    installation.allowedUserIds.map((userId) =>
      enqueueTelegramMessage({
        tenantId: input.tenantId,
        idempotencyKey: `approval:${approval.id}:${userId}:${hash.slice(0, 8)}`,
        chatId: String(userId),
        text: input.prompt,
        replyMarkup,
      })
    )
  );
}

export async function recoverStaleTelegramApprovals(staleAfterMs = 2 * 60 * 1000) {
  const staleThreshold = new Date(Date.now() - staleAfterMs);
  await db
    .update(telegramApprovals)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(telegramApprovals.status, "claimed"), lt(telegramApprovals.updatedAt, staleThreshold)));
  await db
    .update(telegramUpdates)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(telegramUpdates.status, "processing"), lt(telegramUpdates.updatedAt, staleThreshold)));
}

export async function processTelegramApprovalUpdates(limit = 20) {
  await recoverStaleTelegramApprovals();
  const updates = await db.query.telegramUpdates.findMany({ where: eq(telegramUpdates.status, "pending"), orderBy: (rows, { asc }) => [asc(rows.createdAt)], limit });
  for (const update of updates) {
    const [updateClaim] = await db.update(telegramUpdates).set({ status: "processing", updatedAt: new Date() }).where(and(eq(telegramUpdates.id, update.id), eq(telegramUpdates.status, "pending"))).returning({ id: telegramUpdates.id });
    if (!updateClaim) continue;
    try {
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await db.update(telegramUpdates).set({ status: "failed", error: errorMessage.slice(0, 500), updatedAt: new Date() }).where(and(eq(telegramUpdates.id, update.id), eq(telegramUpdates.status, "processing")));
    }
  }
}
