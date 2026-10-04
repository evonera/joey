import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { publishDueDrafts } from "@/lib/publisher-core";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.PUBLICATION_TICK_ENABLED !== "true") return NextResponse.json({ error: "Publication tick is disabled until hosting cadence is verified." }, { status: 503 });
  const started = Date.now();
  try {
    const result = await publishDueDrafts({ limit: 10 });
    const ok = result.failed === 0;
    return NextResponse.json({ ok, ...result, elapsedMs: Date.now() - started, timestamp: new Date().toISOString() }, { status: ok ? 200 : 503 });
  } catch {
    // No raw provider/credential exception details in a cron response.
    return NextResponse.json({ ok: false, error: "Publication task failed", elapsedMs: Date.now() - started }, { status: 503 });
  }
}
