import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { telegramPendingApprovals } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { TelegramUpdate } from "@/lib/telegram";

/**
 * Receives Telegram button presses for flow approval gates.
 * Per-bot setup: Settings → Flow integrations → Telegram → "Connect webhook"
 * (calls setWebhook with TELEGRAM_WEBHOOK_SECRET verification).
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Telegram webhooks not configured" }, { status: 501 });
    }
    if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    const update = (await req.json()) as TelegramUpdate;
    const cq = update.callback_query;
    if (!cq?.data || !cq.id || !cq.message?.chat?.id) {
      return NextResponse.json({ ok: true }); // not an approval callback
    }

    const [action, nonce] = cq.data.split(":") as ["fa" | "fr", string];
    if ((action !== "fa" && action !== "fr") || !nonce) {
      return NextResponse.json({ ok: true });
    }
    const approve = action === "fa";
    const chatId = String(cq.message.chat.id);

    const pending = await db.query.telegramPendingApprovals.findFirst({
      where: eq(telegramPendingApprovals.nonce, nonce),
    });

    // Answer immediately so Telegram clears its spinner either way.
    const { telegramApi, resolveTelegramToken } = await import("@/lib/telegram");
    const token = await resolveTelegramToken(pending?.tenantId ?? "");

    async function tg(method: string, body: Record<string, unknown>) {
      await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => undefined);
    }

    if (!pending || pending.chatId !== chatId) {
      // Chat mismatch or stale/expired button — only the original chat decides.
      await tg("answerCallbackQuery", {
        callback_query_id: cq.id,
        text: "This approval is no longer valid.",
        show_alert: true,
      });
      return NextResponse.json({ ok: true });
    }

    await tg("answerCallbackQuery", {
      callback_query_id: cq.id,
      text: approve ? "Approved" : "Rejected",
    });
    if (pending.messageId) {
      await tg("editMessageText", {
        chat_id: pending.chatId,
        message_id: pending.messageId,
        text: approve
          ? "✅ Approved — resuming flow"
          : "❌ Rejected — run stopped",
      });
    }

    await db
      .delete(telegramPendingApprovals)
      .where(
        and(
          eq(telegramPendingApprovals.nonce, pending.nonce),
          eq(telegramPendingApprovals.tenantId, pending.tenantId),
        ),
      );

    const { resumeRun } = await import("@/app/actions/flows");
    await resumeRun(pending.runId, approve);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[webhooks/telegram]", error);
    // 200 regardless — non-2xx makes Telegram retry in loops.
    return NextResponse.json({ ok: true });
  }
}
