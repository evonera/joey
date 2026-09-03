import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { publishDueDrafts } = await import("@/lib/publisher-core");
  const { runFlowsTick } = await import("../../../../agent/schedules/flows-tick");
  const { processTelegramOutbox } = await import("@/lib/telegram-outbox");
  const { pruneExpiredRateLimits } = await import("@/lib/rate-limit");

  // runFlowsTick() internally coordinates stale run reconciliation, R2 cleanup,
  // stale webhook delivery recovery, Telegram DM retries, Theme Studio analytics sync,
  // and recipe optimization before executing active scheduled flows.
  const results = await Promise.allSettled([
    publishDueDrafts({ limit: 10 }),
    runFlowsTick(),
    processTelegramOutbox(),
    pruneExpiredRateLimits(),
  ]);

  const summary = results.map((r, i) => ({
    task: ["publishDrafts", "flowsTick", "telegramOutbox", "pruneRateLimits"][i],
    status: r.status,
    ...(r.status === "rejected" ? { error: String(r.reason) } : {}),
  }));

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), summary });
}
