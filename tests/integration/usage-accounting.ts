import assert from "node:assert/strict";
import postgres from "postgres";
import { db } from "../../src/lib/db";
import { tenants, usageTracking, usageReservations, agentUsageEvents } from "../../src/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  reserveUsageBudget, settleUsageReservation, releaseUsageReservation,
  failUsageReservation, getOrCreateUsageRow, getTrialGenerationsUsed, FreeTrialLimitReachedError,
} from "../../src/lib/usage";

/** Real PostgreSQL concurrency checks; caller must first requireDisposableDatabase. */
export async function verifyUsageAccountingConcurrency() {
  const tenantId = crypto.randomUUID();
  const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
  try {
    await db.insert(tenants).values({ id: tenantId, name: "Atomic trial test", slug: tenantId, createdAt: new Date() });
    const request = (id?: string, trialGenerationLimit: number | undefined = 3) => reserveUsageBudget({
      id, tenantId, kind: "text", estimatedCostUsd: 0.001, trialGenerationLimit,
    });
    const attempts = await Promise.allSettled(Array.from({ length: 24 }, () => request()));
    const admitted = attempts.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    assert.equal(admitted.length, 3, "concurrent trial requests must reserve at most three provider calls");
    for (const result of attempts) if (result.status === "rejected") assert.ok(result.reason instanceof FreeTrialLimitReachedError);
    assert.equal(await getTrialGenerationsUsed(tenantId), 3);
    assert.equal((await request(admitted[0].id)).id, admitted[0].id, "idempotent replay must not spend another trial slot");
    await settleUsageReservation({ id: admitted[0].id, actualCostUsd: 0.0005 });
    await failUsageReservation(admitted[1].id);
    await assert.rejects(request(), FreeTrialLimitReachedError, "settled and ambiguous calls still consume trial slots");
    await releaseUsageReservation(admitted[2].id);
    const replacement = await request();
    await assert.rejects(request(), FreeTrialLimitReachedError);
    const paidOrByok = await reserveUsageBudget({ tenantId, kind: "text", estimatedCostUsd: 0.001 });
    assert.ok(paidOrByok.id, "paid/BYOK admission does not carry a trial limit");
    await releaseUsageReservation(paidOrByok.id);

    // Hold the workspace usage lock while settlement starts. It must wait on
    // usage without owning a reservation lock, otherwise rollover can deadlock.
    let settlement: Promise<unknown> | undefined;
    try {
      await sql.begin(async blocker => {
        await blocker`set local lock_timeout = '1s'`;
        const [{ pid }] = await blocker`select pg_backend_pid() as pid`;
        await blocker`select id from usage_tracking where tenant_id = ${tenantId} for update`;
        settlement = settleUsageReservation({ id: replacement.id, actualCostUsd: 0.0005 });
        const deadline = Date.now() + 5000;
        let waiting = false;
        while (Date.now() < deadline) {
          const [state] = await sql`select exists (
            select 1 from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))
              and query like '%usage_tracking%' and state = 'active'
          ) as waiting`;
          if (state.waiting) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(waiting, "settlement must be observed waiting on the workspace usage lock");
        await blocker`select id from usage_reservations where id = ${replacement.id} for update`;
      });
    } finally { await settlement; }

    const outstanding = await Promise.all(Array.from({ length: 6 }, () => reserveUsageBudget({ tenantId, kind: "text", estimatedCostUsd: 0.001 })));
    const priorPeriod = new Date("2020-01-01T00:00:00Z");
    await db.update(usageTracking).set({ periodStart: priorPeriod }).where(eq(usageTracking.tenantId, tenantId));
    await db.update(usageReservations).set({ periodStart: priorPeriod }).where(eq(usageReservations.tenantId, tenantId));
    await Promise.all([
      getOrCreateUsageRow(tenantId),
      ...outstanding.map((reservation, index) => index % 2
        ? releaseUsageReservation(reservation.id)
        : settleUsageReservation({ id: reservation.id, actualCostUsd: 0.0005 })),
      reserveUsageBudget({ tenantId, kind: "text", estimatedCostUsd: 0.001 }),
    ]);
    const usage = await db.query.usageTracking.findFirst({ where: eq(usageTracking.tenantId, tenantId) });
    assert.equal(Number(usage?.estimatedCostUsd), 0, "prior-month settlements must not charge the new month's counters");
    assert.equal(Number(usage?.reservedCostUsd), 0.001);
    const events = await db.query.agentUsageEvents.findMany({ where: eq(agentUsageEvents.tenantId, tenantId) });
    assert.equal(new Set(events.map(event => event.id)).size, events.length);
    for (const reservation of outstanding) assert.equal(events.filter(event => event.id === reservation.id).length, 1, "rollover must settle each old reservation once");
    await assert.rejects(request(), FreeTrialLimitReachedError, "month rollover must not restart the lifetime trial");
    console.log("PASS: atomic three-generation trial admission, idempotency, release/retry, paid/BYOK bypass, consistent settlement lock ordering and concurrent month rollover");
  } finally {
    await sql.end({ timeout: 5 });
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  }
}
