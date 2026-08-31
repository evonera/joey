"use server";
import { getActiveTenantId } from "@/lib/auth";
import { installTelegramBot, telegramInstallationStatus } from "@/lib/telegram";

export async function connectTelegramBot(token: string, allowedUserIds: number[]) {
  const tenantId = await getActiveTenantId();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl?.startsWith("https://")) return { error: "NEXT_PUBLIC_APP_URL must be an HTTPS URL." };
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token.trim())) return { error: "Invalid Telegram bot token format." };
  try { return { success: true, installation: await installTelegramBot({ tenantId, token: token.trim(), allowedUserIds, appUrl }) }; }
  catch (error) { console.error("[telegram] bot installation failed", error instanceof Error ? error.message : "unknown error"); return { error: "Telegram rejected the bot configuration." }; }
}

export async function getTelegramBotStatus() {
  try { return await telegramInstallationStatus(await getActiveTenantId()); }
  catch (error) { console.error("[telegram] status check failed", error instanceof Error ? error.message : "unknown error"); return null; }
}
