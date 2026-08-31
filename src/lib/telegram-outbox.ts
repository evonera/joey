import { and, eq, lt } from "drizzle-orm";
import { Bot } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import { db } from "@/lib/db";
import { telegramBotInstallations, telegramOutbox } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { operationalEvent } from "@/lib/operations-log";

export function telegramOutboxKey(parts: { runId: string; nodeId: string; itemKey?: string }) {
  return `flow:${parts.runId}:${parts.nodeId}:${parts.itemKey ?? "root"}`;
}

export async function enqueueTelegramMessage(input: { tenantId: string; idempotencyKey: string; chatId: string; text: string; replyMarkup?: InlineKeyboardMarkup }) {
  if (input.text.length > 4096) throw new Error(`Telegram message exceeds 4096 characters (${input.text.length} chars).`);
  const installation = await db.query.telegramBotInstallations.findFirst({ where: and(eq(telegramBotInstallations.tenantId, input.tenantId), eq(telegramBotInstallations.status, "active")) });
  if (!installation) throw new Error("No active Telegram bot is configured.");
  const inserted = await db.insert(telegramOutbox).values({ tenantId: input.tenantId, installationId: installation.id, idempotencyKey: input.idempotencyKey, chatId: input.chatId, text: input.text, replyMarkup: input.replyMarkup }).onConflictDoNothing().returning({ id: telegramOutbox.id, status: telegramOutbox.status });
  if (inserted[0]) return inserted[0];
  const existing = await db.query.telegramOutbox.findFirst({ where: and(eq(telegramOutbox.tenantId, input.tenantId), eq(telegramOutbox.idempotencyKey, input.idempotencyKey)) });
  if (!existing) throw new Error("Telegram outbox conflict could not be resolved.");
  return { id: existing.id, status: existing.status };
}

export async function recoverStaleOutboxMessages(staleAfterMs = 2 * 60 * 1000) {
  const staleThreshold = new Date(Date.now() - staleAfterMs);
  return db
    .update(telegramOutbox)
    .set({
      status: "uncertain",
      error: "Delivery timed out during transmission; status uncertain.",
      updatedAt: new Date(),
    })
    .where(and(eq(telegramOutbox.status, "sending"), lt(telegramOutbox.updatedAt, staleThreshold)));
}

export async function processTelegramOutbox(limit = 20) {
  await recoverStaleOutboxMessages();
  const pending = await db.query.telegramOutbox.findMany({ where: eq(telegramOutbox.status, "pending"), orderBy: (rows, { asc }) => [asc(rows.createdAt)], limit });
  for (const row of pending) {
    const [claimed] = await db.update(telegramOutbox).set({ status: "sending", updatedAt: new Date() }).where(and(eq(telegramOutbox.id, row.id), eq(telegramOutbox.tenantId, row.tenantId), eq(telegramOutbox.status, "pending"))).returning({ id: telegramOutbox.id });
    if (!claimed) continue;
    try {
      const installation = await db.query.telegramBotInstallations.findFirst({ where: and(eq(telegramBotInstallations.id, row.installationId), eq(telegramBotInstallations.tenantId, row.tenantId), eq(telegramBotInstallations.status, "active")) });
      if (!installation) throw new Error("Telegram installation is inactive.");
      const message = await new Bot(decrypt(installation.encryptedToken), { client: { timeoutSeconds: 10 } }).api.sendMessage(row.chatId, row.text, row.replyMarkup ? { reply_markup: row.replyMarkup as InlineKeyboardMarkup } : undefined);
      await db.update(telegramOutbox).set({ status: "sent", telegramMessageId: message.message_id, sentAt: new Date(), updatedAt: new Date(), error: null }).where(and(eq(telegramOutbox.id, row.id), eq(telegramOutbox.status, "sending")));
      operationalEvent("info", "telegram_outbox.sent", { tenantId: row.tenantId, outboxId: row.id });
    } catch (error) {
      // `sending` is intentionally terminal-ambiguous: Telegram may have accepted
      // the message before the connection failed. Never auto-replay it.
      await db.update(telegramOutbox).set({ status: "uncertain", error: error instanceof Error ? error.message.slice(0, 500) : "Telegram send failed", updatedAt: new Date() }).where(and(eq(telegramOutbox.id, row.id), eq(telegramOutbox.status, "sending")));
      operationalEvent("error", "telegram_outbox.uncertain", {
        tenantId: row.tenantId,
        outboxId: row.id,
        error: error instanceof Error ? error.message : "Telegram send failed",
      });
    }
  }
}
