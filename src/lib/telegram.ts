import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

export type TelegramUpdate = {
  update_id?: number;
  callback_query?: {
    id: string;
    from?: { id?: number; first_name?: string };
    message?: { message_id?: number; chat?: { id?: number } };
    data?: string;
  };
  message?: {
    chat?: { id?: number };
    text?: string;
  };
};

/** Bot token: encrypted api_keys row first, env fallback. */
export async function resolveTelegramToken(tenantId: string): Promise<string> {
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "telegram")),
  });
  if (key?.encryptedKey) return decrypt(key.encryptedKey);
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
  throw new Error(
    "No Telegram bot token. Add one in Settings → Flow integrations (provider: telegram).",
  );
}

export async function telegramApi<T = unknown>(
  tenantId: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = await resolveTelegramToken(tenantId);
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string }
    | null;

  if (!json?.ok) {
    throw new Error(`Telegram ${method} failed: ${json?.description ?? `HTTP ${response.status}`}`);
  }
  return json.result as T;
}

/**
 * Points the tenant's bot at our public webhook so button presses reach us.
 * Requires a publicly reachable HTTPS deployment.
 */
export async function setTelegramWebhook(tenantId: string, baseUrl: string): Promise<void> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is not configured on this instance.");
  }
  await telegramApi(tenantId, "setWebhook", {
    url: `${baseUrl.replace(/\/$/, "")}/api/webhooks/telegram`,
    secret_token: secret,
    allowed_updates: ["callback_query"],
  });
}
