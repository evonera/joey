import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { withTimeout } from "@/lib/dispatch-claim";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Per-task response budget: maxDuration caps the route, so each fan-out task
// gets its own smaller budget. A timeout here only bounds the HTTP response;
// the underlying work is not cancelled (see withTimeout).
const CRON_TASK_TIMEOUT_MS = 55_000;

function cronAuthorized(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const actual = Buffer.from(authHeader);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
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
    withTimeout(publishDueDrafts({ limit: 10 }), CRON_TASK_TIMEOUT_MS, "publishDrafts"),
    withTimeout(runFlowsTick(), CRON_TASK_TIMEOUT_MS, "flowsTick"),
    withTimeout(processTelegramOutbox(), CRON_TASK_TIMEOUT_MS, "telegramOutbox"),
    withTimeout(pruneExpiredRateLimits(), CRON_TASK_TIMEOUT_MS, "pruneRateLimits"),
  ]);

  const summary = results.map((r, i) => ({
    task: ["publishDrafts", "flowsTick", "telegramOutbox", "pruneRateLimits"][i],
    status: r.status,
    ...(r.status === "rejected" ? { error: String(r.reason) } : {}),
  }));

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), summary });
}
