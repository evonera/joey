import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { processThemeStudioAnalyticsSync } = await import("@/lib/theme-studio/learning/analytics-sync");
  const { processThemeStudioOptimization } = await import("@/lib/theme-studio/learning/recipe-optimizer");

  await processThemeStudioAnalyticsSync();
  await processThemeStudioOptimization();

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
