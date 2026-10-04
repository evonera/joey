import { defineChannel, POST } from "eve/channels";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readBoundedJson } from "@/lib/http/read-bounded-json";
import { startScoutBatch } from "../lib/scout-workflow";

const inputSchema = z.object({ jobs: z.array(z.object({ scoutId: z.string().uuid(), tenantId: z.string().min(1).max(200), evaluationId: z.string().uuid(), dispatchAttempt: z.number().int().min(1).max(3), dispatchLeaseUntil: z.string().datetime({ offset: true }) }).strict()).min(1).max(25) }).strict();
export async function handleScoutDispatch(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readBoundedJson(request, 16_384);
  const parsed = body.ok ? inputSchema.safeParse(body.value) : undefined;
  if (!parsed?.success) return Response.json({ error: "Invalid Scout dispatch" }, { status: 400 });
  // The evaluator rechecks the tenant/source/config of every receipt before
  // claiming it. This route only authenticates and accepts the bounded handoff.
  const run = await startScoutBatch(parsed.data.jobs);
  return Response.json({ accepted: parsed.data.jobs.length, runId: run.runId }, { status: 202 });
}
export default defineChannel({ routes: [POST("/scout-dispatch", handleScoutDispatch)] });
