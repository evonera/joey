import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lte, or, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { scouts, scoutEvaluations, scoutEvaluationEvents, scoutRuns, notifications } from "@/lib/db/schema";
import type { EvaluateScoutResult, ScoutAlert } from "./evaluator";
import type { ScoutPostItem } from "./data-provider";

export type ScoutEvaluationReceipt = typeof scoutEvaluations.$inferSelect;
export const SCOUT_EVALUATION_CONCURRENCY = 2;
export const SCOUT_EVALUATION_TIMEOUT_MS = 110_000;
const LEASE_MS = 150_000;
export const SCOUT_DISPATCH_ATTEMPTS = 3;

export function scoutConfigurationKey(scout: Pick<typeof scouts.$inferSelect, "targetUrl" | "platform" | "goalCondition">) {
  return createHash("sha256").update(JSON.stringify([scout.targetUrl, scout.platform, scout.goalCondition])).digest("hex");
}
export function scoutPollEventKey(scout: Pick<typeof scouts.$inferSelect, "pollIntervalMinutes">, now = new Date()) {
  return `poll:${Math.floor(now.getTime() / (Math.max(1, scout.pollIntervalMinutes) * 60_000))}`;
}

export async function reserveScoutEvaluation(scout: typeof scouts.$inferSelect, eventKey = scoutPollEventKey(scout)) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`scout-evaluation:${scout.tenantId}:${scout.id}`}))`);
    const configKey = scoutConfigurationKey(scout);
    const alias = await tx.query.scoutEvaluationEvents.findFirst({ where: and(eq(scoutEvaluationEvents.tenantId, scout.tenantId), eq(scoutEvaluationEvents.scoutId, scout.id), eq(scoutEvaluationEvents.configKey, configKey), eq(scoutEvaluationEvents.eventKey, eventKey)) });
    if (alias) {
      const bound = await tx.query.scoutEvaluations.findFirst({ where: and(eq(scoutEvaluations.id, alias.evaluationId), eq(scoutEvaluations.tenantId, scout.tenantId)) });
      if (bound) return bound;
    }
    const existing = await tx.query.scoutEvaluations.findFirst({
      where: and(eq(scoutEvaluations.tenantId, scout.tenantId), eq(scoutEvaluations.scoutId, scout.id), eq(scoutEvaluations.configKey, configKey),
        or(eq(scoutEvaluations.eventKey, eventKey), inArray(scoutEvaluations.status, ["pending", "running"]),
          and(eq(scoutEvaluations.status, "completed"), gt(scoutEvaluations.createdAt, new Date(Date.now() - scout.pollIntervalMinutes * 60_000))))),
      orderBy: [desc(scoutEvaluations.createdAt)],
    });
    const receipt = existing ?? (await tx.insert(scoutEvaluations).values({ tenantId: scout.tenantId, scoutId: scout.id, configKey, eventKey }).returning())[0];
    await tx.insert(scoutEvaluationEvents).values({ tenantId: scout.tenantId, scoutId: scout.id, configKey, eventKey, evaluationId: receipt.id });
    return receipt;
  });
}

export async function claimScoutEvaluation(receipt: ScoutEvaluationReceipt) {
  return db.transaction(async (tx) => {
    // A global transaction lock makes the two slots atomic across all workflow
    // dispatchers, manual checks, and agency agents. No lock spans network work.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('scout-evaluation-capacity'))`);
    const now = new Date();
    const [ambiguous] = await tx.update(scoutEvaluations).set({ status: "uncertain", error: "Evaluation was interrupted after a paid phase started. Automatic replay is disabled.", updatedAt: now })
      .where(and(eq(scoutEvaluations.id, receipt.id), eq(scoutEvaluations.tenantId, receipt.tenantId), eq(scoutEvaluations.status, "running"),
        inArray(scoutEvaluations.phase, ["collecting", "judging"]), lte(scoutEvaluations.leaseExpiresAt, now))).returning();
    if (ambiguous) return { claimed: false, receipt: ambiguous };
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(scoutEvaluations)
      .where(and(eq(scoutEvaluations.status, "running"), gt(scoutEvaluations.leaseExpiresAt, now)));
    if (count >= SCOUT_EVALUATION_CONCURRENCY) return { claimed: false, receipt };
    const sameScout = await tx.query.scoutEvaluations.findFirst({ where: and(eq(scoutEvaluations.tenantId, receipt.tenantId), eq(scoutEvaluations.scoutId, receipt.scoutId), eq(scoutEvaluations.status, "running"), gt(scoutEvaluations.leaseExpiresAt, now)) });
    if (sameScout) return { claimed: false, receipt };
    const [claimed] = await tx.update(scoutEvaluations).set({ status: "running", leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + LEASE_MS), updatedAt: now })
      .where(and(eq(scoutEvaluations.id, receipt.id), eq(scoutEvaluations.tenantId, receipt.tenantId),
        or(eq(scoutEvaluations.status, "pending"), and(eq(scoutEvaluations.status, "running"), inArray(scoutEvaluations.phase, ["preparing", "collected"]), lte(scoutEvaluations.leaseExpiresAt, now))))).returning();
    const current = claimed ?? await tx.query.scoutEvaluations.findFirst({ where: and(eq(scoutEvaluations.id, receipt.id), eq(scoutEvaluations.tenantId, receipt.tenantId)) });
    return { claimed: Boolean(claimed), receipt: current ?? receipt };
  });
}

function owned(receipt: ScoutEvaluationReceipt) {
  // Leases are UTC timestamps without a zone. Use the wall clock, not the
  // transaction start time or the session's local timezone.
  return and(eq(scoutEvaluations.id, receipt.id), eq(scoutEvaluations.tenantId, receipt.tenantId), eq(scoutEvaluations.leaseToken, receipt.leaseToken!), eq(scoutEvaluations.status, "running"), sql`${scoutEvaluations.leaseExpiresAt} > (clock_timestamp() AT TIME ZONE 'UTC')`);
}
export async function markScoutEvaluationPhase(receipt: ScoutEvaluationReceipt, phase: "collecting" | "collected" | "judging", items?: ScoutPostItem[]) {
  const [saved] = await db.update(scoutEvaluations).set({ phase, ...(items ? { items } : {}), updatedAt: new Date() }).where(owned(receipt)).returning();
  if (!saved) throw new Error("Scout evaluation lease expired or was replaced.");
  return saved;
}

export function resultFromScoutEvaluation(receipt: ScoutEvaluationReceipt): EvaluateScoutResult {
  if (receipt.status === "completed" && receipt.result) return { ...(receipt.result as EvaluateScoutResult), evaluationId: receipt.id, reused: true };
  return { triggered: false, itemsFound: 0, evaluationId: receipt.id, pending: ["pending", "running"].includes(receipt.status),
    error: receipt.error ?? (["pending", "running"].includes(receipt.status) ? "Scout evaluation is already queued or running." : "Scout evaluation failed. Review the receipt before starting another paid collection.") };
}

export async function completeScoutEvaluation(receipt: ScoutEvaluationReceipt, scout: typeof scouts.$inferSelect, result: EvaluateScoutResult, beforeCommit?: () => Promise<void>) {
  return db.transaction(async (tx) => {
    await beforeCommit?.();
    const [saved] = await tx.update(scoutEvaluations).set({ status: "completed", result, updatedAt: new Date(), leaseExpiresAt: null })
      .where(owned(receipt)).returning();
    if (!saved) throw new Error("Scout evaluation lease expired or was replaced.");
    // Updating a paused or edited Scout is disallowed even for a late worker.
    const [current] = await tx.update(scouts).set({ lastPolledAt: new Date(), ...(result.alert ? { latestAlert: result.alert } : {}), updatedAt: new Date() })
      .where(and(eq(scouts.id, scout.id), eq(scouts.tenantId, scout.tenantId),
        // PostgreSQL defaults retain microseconds; JS Date retains milliseconds.
        // Compare at the precision returned by the driver, and compare the
        // governed fields directly to fence edits within that same millisecond.
        sql`date_trunc('milliseconds', ${scouts.updatedAt}) = ${scout.updatedAt.toISOString()}::timestamp`,
        eq(scouts.targetUrl, scout.targetUrl), eq(scouts.goalCondition, scout.goalCondition), eq(scouts.platform, scout.platform), eq(scouts.isActive, scout.isActive), eq(scouts.pollIntervalMinutes, scout.pollIntervalMinutes))).returning();
    if (!current) throw new Error("Scout was edited, paused, or removed before completion.");
    await tx.insert(scoutRuns).values({ scoutId: scout.id, tenantId: scout.tenantId, status: result.triggered ? "alert_triggered" : "no_change", itemsFound: result.itemsFound, alertData: result.alert ?? null });
    if (result.alert && !sameAlert(scout.latestAlert as ScoutAlert | null, result.alert)) {
      await tx.insert(notifications).values({ tenantId: scout.tenantId, type: "scout_alert", title: result.alert.title,
        body: `Competitor change detected for ${scout.name}: ${result.alert.changes.map((change) => change.label).join(", ")}`, link: "/scouts", metadata: { ...result.alert, evaluationId: receipt.id } });
    }
    await beforeCommit?.();
    return { ...result, evaluationId: receipt.id };
  });
}
function sameAlert(previous: ScoutAlert | null, next: ScoutAlert) {
  return Boolean(previous?.samplePost?.url && previous.samplePost.url === next.samplePost?.url && JSON.stringify(previous.changes) === JSON.stringify(next.changes));
}

export async function failScoutEvaluation(receipt: ScoutEvaluationReceipt, error: string) {
  return db.transaction(async (tx) => {
    const [failed] = await tx.update(scoutEvaluations).set({ status: ["collecting", "judging"].includes(receipt.phase) ? "uncertain" : "failed", error: error.slice(0, 300), updatedAt: new Date() }).where(owned(receipt)).returning();
    if (failed) await tx.insert(scoutRuns).values({ scoutId: receipt.scoutId, tenantId: receipt.tenantId, status: "failed", itemsFound: Array.isArray(receipt.items) ? receipt.items.length : 0, error: error.slice(0, 300) });
    return failed;
  });
}
