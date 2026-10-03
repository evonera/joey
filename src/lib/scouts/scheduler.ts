import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { scouts, scoutEvaluations, scoutEvaluationEvents } from "@/lib/db/schema";
import { reserveScoutEvaluation, SCOUT_DISPATCH_ATTEMPTS, type ScoutEvaluationReceipt } from "./evaluation-receipts";

export const SCOUT_DISPATCH_LIMIT = 25;
export interface ScoutDispatchJob { scoutId: string; tenantId: string; evaluationId: string; dispatchAttempt: number; dispatchLeaseUntil: string }
export function scoutDispatchBackoff(attempt: number) { return Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1)); }

export async function deferScoutEvaluationDispatch(job: ScoutDispatchJob) {
  // Capacity contention has not started a paid phase and can retry promptly.
  await db.update(scoutEvaluations).set({ dispatchAttempts: sql`greatest(0, ${scoutEvaluations.dispatchAttempts} - 1)`, dispatchLeaseUntil: null, nextDispatchAt: new Date(Date.now() + 60_000), updatedAt: new Date() })
    .where(and(eq(scoutEvaluations.id, job.evaluationId), eq(scoutEvaluations.tenantId, job.tenantId), eq(scoutEvaluations.status, "pending"),
      eq(scoutEvaluations.dispatchAttempts, job.dispatchAttempt), eq(scoutEvaluations.dispatchLeaseUntil, new Date(job.dispatchLeaseUntil))));
}

export async function claimScoutDispatch(receipt: ScoutEvaluationReceipt) {
  const now = new Date();
  // 25 jobs at concurrency two can occupy the workflow for ~24 minutes.
  const [claimed] = await db.update(scoutEvaluations).set({ dispatchAttempts: sql`${scoutEvaluations.dispatchAttempts} + 1`, dispatchLeaseUntil: new Date(now.getTime() + 35 * 60_000), updatedAt: now })
    .where(and(eq(scoutEvaluations.id, receipt.id), eq(scoutEvaluations.tenantId, receipt.tenantId),
      inArray(scoutEvaluations.status, ["pending", "running"]), lt(scoutEvaluations.dispatchAttempts, SCOUT_DISPATCH_ATTEMPTS), lte(scoutEvaluations.nextDispatchAt, now),
      or(sql`${scoutEvaluations.dispatchLeaseUntil} IS NULL`, lte(scoutEvaluations.dispatchLeaseUntil, now)),
      or(eq(scoutEvaluations.status, "pending"), lte(scoutEvaluations.leaseExpiresAt, now)))).returning();
  return claimed;
}
export async function releaseScoutDispatch(receipt: ScoutEvaluationReceipt) {
  await db.update(scoutEvaluations).set({ dispatchLeaseUntil: null, nextDispatchAt: new Date(Date.now() + scoutDispatchBackoff(receipt.dispatchAttempts)), updatedAt: new Date() })
    .where(and(eq(scoutEvaluations.id, receipt.id), eq(scoutEvaluations.tenantId, receipt.tenantId), inArray(scoutEvaluations.status, ["pending", "running"]), eq(scoutEvaluations.dispatchAttempts, receipt.dispatchAttempts), eq(scoutEvaluations.dispatchLeaseUntil, receipt.dispatchLeaseUntil!)));
}

/** This cron operation only reads, claims, and hands off up to 25 durable jobs. */
export async function dispatchScoutsTick(dispatch?: (receipts: ScoutDispatchJob[]) => Promise<unknown>) {
  const now = new Date();
  // Exhausted handoffs are surfaced as terminal failures, so pending rows do
  // not trap future scheduled intervals forever. This is bounded cleanup too.
  const exhausted = await db.query.scoutEvaluations.findMany({
    where: and(inArray(scoutEvaluations.status, ["pending", "running"]), eq(scoutEvaluations.dispatchAttempts, SCOUT_DISPATCH_ATTEMPTS),
      or(sql`${scoutEvaluations.dispatchLeaseUntil} IS NULL`, lte(scoutEvaluations.dispatchLeaseUntil, now)),
      or(eq(scoutEvaluations.status, "pending"), lte(scoutEvaluations.leaseExpiresAt, now))), limit: SCOUT_DISPATCH_LIMIT,
  });
  for (const receipt of exhausted) await db.update(scoutEvaluations).set({
    status: ["collecting", "judging"].includes(receipt.phase) ? "uncertain" : "failed", error: "Scout dispatch retry limit reached. Automatic replay is disabled.", updatedAt: now,
  }).where(and(eq(scoutEvaluations.id, receipt.id), eq(scoutEvaluations.status, receipt.status), eq(scoutEvaluations.dispatchAttempts, SCOUT_DISPATCH_ATTEMPTS),
    or(eq(scoutEvaluations.status, "pending"), lte(scoutEvaluations.leaseExpiresAt, now))));
  const recoverable = await db.select({ receipt: scoutEvaluations }).from(scoutEvaluations).innerJoin(scouts, and(eq(scouts.id, scoutEvaluations.scoutId), eq(scouts.tenantId, scoutEvaluations.tenantId)))
    .where(and(eq(scouts.isActive, true), inArray(scoutEvaluations.status, ["pending", "running"]), lt(scoutEvaluations.dispatchAttempts, SCOUT_DISPATCH_ATTEMPTS), lte(scoutEvaluations.nextDispatchAt, now),
      or(sql`${scoutEvaluations.dispatchLeaseUntil} IS NULL`, lte(scoutEvaluations.dispatchLeaseUntil, now)),
      or(eq(scoutEvaluations.status, "pending"), lte(scoutEvaluations.leaseExpiresAt, now))))
    .orderBy(asc(scoutEvaluations.createdAt)).limit(SCOUT_DISPATCH_LIMIT);
  const due = recoverable.length < SCOUT_DISPATCH_LIMIT ? await db.select().from(scouts).where(
    and(eq(scouts.isActive, true), sql`(${scouts.lastPolledAt} IS NULL OR ${scouts.lastPolledAt} + ${scouts.pollIntervalMinutes} * interval '1 minute' <= ${now.toISOString()}::timestamp)`,
      // Claimed/backoff/terminal rows must not repeatedly consume the first
      // page and starve later Scouts. Recovery is selected above separately.
      sql`NOT EXISTS (SELECT 1 FROM ${scoutEvaluations} WHERE ${scoutEvaluations.tenantId} = ${scouts.tenantId} AND ${scoutEvaluations.scoutId} = ${scouts.id} AND ${scoutEvaluations.status} IN ('pending', 'running'))`,
      sql`NOT EXISTS (SELECT 1 FROM ${scoutEvaluationEvents} WHERE ${scoutEvaluationEvents.tenantId} = ${scouts.tenantId} AND ${scoutEvaluationEvents.scoutId} = ${scouts.id} AND ${scoutEvaluationEvents.eventKey} = 'poll:' || floor(extract(epoch from ${now.toISOString()}::timestamptz) / (greatest(1, ${scouts.pollIntervalMinutes}) * 60))::text)`)
  ).orderBy(asc(scouts.lastPolledAt), asc(scouts.id)).limit(SCOUT_DISPATCH_LIMIT - recoverable.length) : [];
  const candidates = [...recoverable.map(({ receipt }) => receipt)];
  for (const scout of due) candidates.push(await reserveScoutEvaluation(scout));
  const claimed: ScoutEvaluationReceipt[] = [];
  for (const receipt of new Map(candidates.map((receipt) => [receipt.id, receipt])).values()) {
    const lease = await claimScoutDispatch(receipt);
    if (lease) claimed.push(lease);
  }
  if (!claimed.length) return { checkedCount: 0, dispatchedCount: 0, results: [] };
  try {
    const handoff = dispatch ?? dispatchScoutBatchToEve;
    await handoff(claimed.map((receipt) => ({ scoutId: receipt.scoutId, tenantId: receipt.tenantId, evaluationId: receipt.id, dispatchAttempt: receipt.dispatchAttempts, dispatchLeaseUntil: receipt.dispatchLeaseUntil!.toISOString() })));
    return { checkedCount: claimed.length, dispatchedCount: claimed.length, results: [] };
  } catch {
    for (const receipt of claimed) await releaseScoutDispatch(receipt);
    return { checkedCount: claimed.length, dispatchedCount: 0, results: [], error: "Scout dispatch failed; bounded retry is scheduled." };
  }
}

export function scoutDispatchUrl() {
  if (process.env.EVE_SCOUT_DISPATCH_URL) return process.env.EVE_SCOUT_DISPATCH_URL;
  if (process.env.VERCEL || process.env.EVE_NEXT_PRODUCTION_ORIGIN) {
    const origin = process.env.EVE_NEXT_PRODUCTION_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
    if (!origin) throw new Error("Set the application's public origin before dispatching Scouts.");
    return new URL("/scout-dispatch", origin).toString();
  }
  return `http://127.0.0.1:${process.env.EVE_NEXT_PRODUCTION_PORT || "4274"}/scout-dispatch`;
}
async function dispatchScoutBatchToEve(jobs: ScoutDispatchJob[]) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("Scout dispatch requires the cron secret.");
  const response = await fetch(scoutDispatchUrl(), { method: "POST", redirect: "error", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify({ jobs }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error("Scout workflow handoff was rejected."); }
  await response.body?.cancel();
}
