"use server";
import { getActiveTenantId } from "@/lib/auth";
import { installTelegramBot, telegramInstallationStatus } from "@/lib/telegram";

export async function connectTelegramBot(token: string, allowedUserIds: number[]) {
  const tenantId = await getActiveTenantId();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl?.startsWith("https://")) return { error: "NEXT_PUBLIC_APP_URL must be an HTTPS URL." };
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token.trim())) return { error: "Invalid Telegram bot token format." };
  const allowlist = [...new Set(allowedUserIds)];
  if (allowlist.length === 0) return { error: "Add at least one Telegram user ID. An empty allowlist denies everyone." };
  if (allowlist.some((value) => !Number.isSafeInteger(value) || value <= 0)) return { error: "Telegram user IDs must be positive integers." };
  try { return { success: true, installation: await installTelegramBot({ tenantId, token: token.trim(), allowedUserIds: allowlist, appUrl }) }; }
  catch (error) { console.error("[telegram] bot installation failed", error instanceof Error ? error.message : "unknown error"); return { error: error instanceof Error && /allowed Telegram user ID/.test(error.message) ? error.message : "Telegram rejected the bot configuration." }; }
}

export async function getTelegramBotStatus() {
  try { return await telegramInstallationStatus(await getActiveTenantId()); }
  catch (error) { console.error("[telegram] status check failed", error instanceof Error ? error.message : "unknown error"); return null; }
}
