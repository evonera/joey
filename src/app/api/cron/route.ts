import { NextResponse } from "next/server";

export const maxDuration = 60;

const ANALYTICS_TIMEOUT_MS = 40_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { processThemeStudioAnalyticsSync } = await import("@/lib/theme-studio/learning/analytics-sync");
  const { processThemeStudioOptimization } = await import("@/lib/theme-studio/learning/recipe-optimizer");

  const analyticsResult = await withTimeout(processThemeStudioAnalyticsSync(), ANALYTICS_TIMEOUT_MS);
  const optimizationResult = await withTimeout(processThemeStudioOptimization(), 15_000);

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    analytics: analyticsResult !== null,
    optimization: optimizationResult !== null,
  });
}
