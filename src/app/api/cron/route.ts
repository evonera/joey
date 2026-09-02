import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { processThemeStudioAnalyticsSync } = await import("@/lib/theme-studio/learning/analytics-sync");
  const { processThemeStudioOptimization } = await import("@/lib/theme-studio/learning/recipe-optimizer");
  const { publishDueDrafts } = await import("@/lib/publisher-core");
  const { runFlowsTick } = await import("../../../../agent/schedules/flows-tick");
  const { processTelegramOutbox } = await import("@/lib/telegram-outbox");
  const { pruneExpiredRateLimits } = await import("@/lib/rate-limit");

  const results = await Promise.allSettled([
    publishDueDrafts(),
    runFlowsTick(),
    processTelegramOutbox(),
    pruneExpiredRateLimits(),
    processThemeStudioAnalyticsSync(),
    processThemeStudioOptimization(),
  ]);

  const summary = results.map((r, i) => ({
    task: ["publishDrafts", "flowsTick", "telegramOutbox", "pruneRateLimits", "analyticsSync", "recipeOptimization"][i],
    status: r.status,
    ...(r.status === "rejected" ? { error: String(r.reason) } : {}),
  }));

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), summary });
}
