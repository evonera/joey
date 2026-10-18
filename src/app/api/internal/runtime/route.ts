import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronAuthorized } from "@/lib/cron-auth";
import { themeMediaStorageReady } from "@/lib/theme-studio/runtime-readiness";
import { RENDERER_VERSION } from "@/lib/media-engine/spec";

export const dynamic = "force-dynamic";

/** Read-only probe used before the external scheduler admits any work. */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public'
          AND table_name = 'theme_sources' AND column_name IN ('last_attempt_at', 'last_success_at', 'last_poll_error')) AS columns,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public'
          AND indexname IN ('drafts_tenant_created_idx', 'posts_tenant_published_idx', 'social_accounts_tenant_created_idx')) AS indexes
    `);
    const row = (Array.isArray(result) ? result[0] : (result as unknown as { rows: Array<{ columns: number; indexes: number }> }).rows[0]) as { columns: number; indexes: number };
    const checks = {
      schema: row.columns === 3 && row.indexes === 3,
      storage: themeMediaStorageReady(),
      worker: (process.env.MEDIA_WORKER_SECRET?.length ?? 0) >= 32 && /^https:\/\/[^/]+\.modal\.run\/?$/.test(process.env.MEDIA_WORKER_DISPATCH_URL || ""),
    };
    const ready = Object.values(checks).every(Boolean);
    return NextResponse.json({ ready, checks, renderer: RENDERER_VERSION }, { status: ready ? 200 : 503 });
  } catch {
    return NextResponse.json({ ready: false, checks: { database: false } }, { status: 503 });
  }
}
