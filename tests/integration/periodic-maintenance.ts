import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { runPeriodicMaintenance } = await import("../../src/lib/periodic-maintenance");
const { db } = await import("../../src/lib/db");
const { rateLimitCounters } = await import("../../src/lib/db/schema");
const { inArray } = await import("drizzle-orm");
const prefix = `integration-${crypto.randomUUID()}`;
const names = ["slow", "retry", "structured", "independent"].map(name => `${prefix}-${name}`);
const now = new Date("2026-10-30T12:01:00Z");
try {
  let calls = 0;
  const tasks = [{ name: names[0], minutes: 15, run: async () => { calls++; } }];
  // Separate callers contend on the actual PostgreSQL unique constraint.
  const results = await Promise.all(Array.from({ length: 12 }, () => runPeriodicMaintenance(tasks, now)));
  assert.equal(calls, 1);
  assert.equal(results.flat().filter(result => result.status === "skipped").length, 11);
  await runPeriodicMaintenance(tasks, new Date("2026-10-30T12:14:59Z"));
  assert.equal(calls, 1);
  await runPeriodicMaintenance(tasks, new Date("2026-10-30T12:15:00Z"));
  assert.equal(calls, 2);

  let fail = true, retries = 0, independent = 0;
  const retryTasks = [
    { name: names[1], minutes: 60, run: async () => { retries++; if (fail) throw new Error("Expected integration failure"); } },
    { name: names[2], minutes: 15, run: async () => ({ failed: fail ? 1 : 0 }) },
    { name: names[3], minutes: 5, run: async () => { independent++; } },
  ];
  assert.deepEqual((await runPeriodicMaintenance(retryTasks, now)).map(result => result.status), ["failed", "failed", "fulfilled"]);
  assert.equal(independent, 1);
  fail = false;
  assert.deepEqual((await runPeriodicMaintenance(retryTasks, now)).map(result => result.status), ["fulfilled", "fulfilled", "skipped"]);
  assert.equal(retries, 2);
  assert.equal(independent, 1);
  console.log("PASS: concurrent maintenance admission, cadence boundaries, failure retry and independent task progress on real PostgreSQL.");
} finally {
  await db.delete(rateLimitCounters).where(inArray(rateLimitCounters.tokenId, names.map(name => `internal:maintenance:${name}`)));
}
process.exit(0);
