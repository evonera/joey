import { randomBytes } from "node:crypto";
import { Bot } from "grammy";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { telegramBotInstallations, telegramUpdates } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { hashWebhookSecret, verifyWebhookSecret } from "@/lib/flows/webhook-secret";

export const TELEGRAM_UPDATE_LIMIT_BYTES = 1024 * 1024;
export const newTelegramWebhookSecret = () => randomBytes(32).toString("base64url");

export function telegramSenderId(payload: Record<string, unknown>): number | null {
  const message = payload.message as Record<string, unknown> | undefined;
  const callback = payload.callback_query as Record<string, unknown> | undefined;
  const sender = (message?.from ?? callback?.from) as Record<string, unknown> | undefined;
  return Number.isSafeInteger(sender?.id) ? sender!.id as number : null;
}

/**
 * Fail-closed allowlist: an empty list denies everyone. Fresh installs must
 * configure at least one Telegram user ID during bot setup, otherwise the
 * bot would silently admit any sender (including approval callbacks that
 * can resume flow runs).
 */
export function telegramSenderAllowed(allowedUserIds: number[], senderId: number | null): boolean {
  if (allowedUserIds.length === 0 || senderId === null) return false;
  return allowedUserIds.includes(senderId);
}

/** Telegram marks bot senders with `from.is_bot`; never admit them. */
export function telegramSenderIsBot(payload: Record<string, unknown>): boolean {
  const message = payload.message as Record<string, unknown> | undefined;
  const callback = payload.callback_query as Record<string, unknown> | undefined;
  const sender = (message?.from ?? callback?.from) as Record<string, unknown> | undefined;
  return sender?.is_bot === true;
}

/** Only private DMs are admitted; group/channel updates are ignored. */
export function telegramChatType(payload: Record<string, unknown>): string | null {
  const message = payload.message as Record<string, unknown> | undefined;
  const chat = message?.chat as Record<string, unknown> | undefined;
  return typeof chat?.type === "string" ? (chat.type as string) : null;
}

/** Upload policy for Telegram attachments mirrored from channel best practice. */
export const TELEGRAM_ALLOWED_MEDIA_TYPES = ["image/*", "application/pdf"] as const;
export const TELEGRAM_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function telegramBot(token: string) { return new Bot(token, { client: { timeoutSeconds: 10 } }); }

export async function installTelegramBot(input: { tenantId: string; token: string; allowedUserIds: number[]; appUrl: string }) {
  const allowlist = [...new Set(input.allowedUserIds)];
  if (allowlist.length === 0) {
    throw new Error("At least one allowed Telegram user ID is required.");
  }
  if (allowlist.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Telegram user IDs must be positive integers.");
  }
  const bot = telegramBot(input.token);
  const me = await bot.api.getMe();
  const secret = newTelegramWebhookSecret();
  const existing = await db.query.telegramBotInstallations.findFirst({ where: eq(telegramBotInstallations.tenantId, input.tenantId) });
  const id = existing?.id ?? crypto.randomUUID();
  const webhookUrl = `${input.appUrl.replace(/\/$/, "")}/api/webhooks/telegram/${id}`;
  const values = { encryptedToken: encrypt(input.token), webhookSecretHash: hashWebhookSecret(secret), botTelegramId: me.id, botUsername: me.username, allowedUserIds: allowlist, status: "configuring", updatedAt: new Date() };
  await db.insert(telegramBotInstallations).values({ id, tenantId: input.tenantId, ...values }).onConflictDoUpdate({ target: telegramBotInstallations.tenantId, set: values });
  try {
    await bot.api.setWebhook(webhookUrl, { secret_token: secret, allowed_updates: ["message", "callback_query"] });
    await db.update(telegramBotInstallations).set({ status: "active", updatedAt: new Date() }).where(and(eq(telegramBotInstallations.id, id), eq(telegramBotInstallations.tenantId, input.tenantId), eq(telegramBotInstallations.webhookSecretHash, hashWebhookSecret(secret))));
  } catch (error) {
    await db.update(telegramBotInstallations).set({ status: "setup_failed", updatedAt: new Date() }).where(and(eq(telegramBotInstallations.id, id), eq(telegramBotInstallations.tenantId, input.tenantId), eq(telegramBotInstallations.webhookSecretHash, hashWebhookSecret(secret))));
    throw error;
  }
  return { id, username: me.username, webhookUrl };
}

export async function telegramInstallationStatus(tenantId: string) {
  const installation = await db.query.telegramBotInstallations.findFirst({ where: eq(telegramBotInstallations.tenantId, tenantId) });
  if (!installation) return null;
  const info = await telegramBot(decrypt(installation.encryptedToken)).api.getWebhookInfo();
  return { id: installation.id, username: installation.botUsername, status: installation.status, webhookUrl: info.url, pendingUpdates: info.pending_update_count, lastError: info.last_error_message };
}

export async function processTelegramUpdate(
  installation: typeof telegramBotInstallations.$inferSelect,
  updateRowId: string,
  payload: Record<string, unknown>
) {
  try {
    const token = decrypt(installation.encryptedToken);
    const bot = telegramBot(token);
    await bot.handleUpdate(payload as any);
    await db
      .update(telegramUpdates)
      .set({ status: "processed", processedAt: new Date(), updatedAt: new Date() })
      .where(eq(telegramUpdates.id, updateRowId));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await db
      .update(telegramUpdates)
      .set({ status: "failed", error: errorMessage.slice(0, 500), updatedAt: new Date() })
      .where(eq(telegramUpdates.id, updateRowId));
    throw error;
  }
}

export async function admitTelegramUpdate(installationId: string, secret: string | null, payload: Record<string, unknown>) {
  const installation = await db.query.telegramBotInstallations.findFirst({ where: and(eq(telegramBotInstallations.id, installationId), eq(telegramBotInstallations.status, "active")) });
  if (!installation || !verifyWebhookSecret(secret, installation.webhookSecretHash)) return { authenticated: false as const };
  const updateId = payload.update_id;
  if (!Number.isSafeInteger(updateId)) throw new Error("Telegram update_id must be a safe integer.");
  // Ignore bot senders and non-private chats before allowlist evaluation.
  if (telegramSenderIsBot(payload)) return { authenticated: true as const, admitted: false as const, reason: "bot_sender" as const };
  const chatType = telegramChatType(payload);
  if (chatType !== null && chatType !== "private") return { authenticated: true as const, admitted: false as const, reason: "non_private_chat" as const };
  const senderId = telegramSenderId(payload);
  if (!telegramSenderAllowed(installation.allowedUserIds, senderId)) return { authenticated: true as const, admitted: false as const, reason: "forbidden_sender" as const };
  // Insert as pending only. The approval poller (processTelegramApprovalUpdates)
  // owns pending→processing→terminal transitions; eager processing here would
  // finalize rows the poller never sees.
  const [inserted] = await db.insert(telegramUpdates).values({ installationId, updateId: updateId as number, payload }).onConflictDoNothing().returning({ id: telegramUpdates.id });
  return { authenticated: true as const, admitted: Boolean(inserted), duplicate: !inserted };
}
