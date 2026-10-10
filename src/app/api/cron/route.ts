import { NextResponse } from "next/server";
import { withTimeout } from "@/lib/dispatch-claim";
import { cronAuthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { rateLimitCounters } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Per-task response budget: maxDuration caps the route, so each fan-out task
// gets its own smaller budget. A timeout here only bounds the HTTP response;
// the underlying work is not cancelled (see withTimeout).
const CRON_TASK_TIMEOUT_MS = 55_000;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Vercel's daily fallback and Modal's minute scheduler share one admission.
  const admitted = await db.insert(rateLimitCounters).values({
    tokenId: "internal:cron",
    windowStart: new Date(Math.floor(Date.now() / 60_000) * 60_000),
    count: 1,
  }).onConflictDoNothing().returning({ tokenId: rateLimitCounters.tokenId });
  if (!admitted.length) return NextResponse.json({ ok: true, skipped: "already_admitted" });

  const { publishDueDrafts } = await import("@/lib/publisher-core");
  const { runFlowsTick } = await import("../../../../agent/schedules/flows-tick");
  const { runScoutsTick } = await import("@/lib/scouts/evaluator");
  const { processTelegramOutbox } = await import("@/lib/telegram-outbox");
  const { pruneExpiredRateLimits } = await import("@/lib/rate-limit");

  // runFlowsTick() internally coordinates stale run reconciliation, R2 cleanup,
  // stale webhook delivery recovery, Telegram DM retries, Theme Studio analytics sync,
  // and recipe optimization before executing active scheduled flows.
  const results = await Promise.allSettled([
    // Retain the existing daily publisher until the separate cadence has been
    // explicitly activated; do not silently stop existing scheduled posts.
    withTimeout<{ delegated: boolean } | { published: number; failed: number; recovered: number }>(process.env.PUBLICATION_TICK_ENABLED === "true" ? Promise.resolve({ delegated: true }) : publishDueDrafts({ limit: 10 }), CRON_TASK_TIMEOUT_MS, "publishDrafts"),
    withTimeout(runFlowsTick(), CRON_TASK_TIMEOUT_MS, "flowsTick"),
    // Scout collection/judging runs in Workflow steps after this bounded handoff.
    withTimeout(runScoutsTick(), CRON_TASK_TIMEOUT_MS, "scoutsTick"),
    withTimeout(processTelegramOutbox(), CRON_TASK_TIMEOUT_MS, "telegramOutbox"),
    withTimeout(pruneExpiredRateLimits(), CRON_TASK_TIMEOUT_MS, "pruneRateLimits"),
  ]);

  const summary = results.map((r, i) => ({
    task: ["publishDrafts", "flowsTick", "scoutsTick", "telegramOutbox", "pruneRateLimits"][i],
    status: r.status,
    ...(r.status === "rejected" ? { error: "Task failed or timed out" } : {}),
    ...(r.status === "fulfilled" && r.value && typeof r.value === "object" && "failed" in r.value && typeof r.value.failed === "number" && r.value.failed > 0 ? { error: "Task reported failed operations" } : {}),
  }));

  const ok = summary.every(task => !("error" in task));
  return NextResponse.json({ ok, timestamp: new Date().toISOString(), summary }, { status: ok ? 200 : 503 });
}
