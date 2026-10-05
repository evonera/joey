// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { tenants, scouts, scoutEvaluations, scoutRuns, notifications, flows, assets, mediaRenderJobs } from "@/lib/db/schema";
import { submitRender } from "@/lib/media-engine/engine";
import { requireDisposableDatabase } from "./require-disposable-database";

const state = vi.hoisted(() => ({ client: null as import("postgres").Sql | null }));
vi.mock("@/lib/db", async () => {
  if (process.env.JOEY_INTEGRATION_TEST !== "true") return { db: {} };
  await (await import("./require-disposable-database")).requireDisposableDatabase();
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const schema = await import("@/lib/db/schema");
  state.client = postgres(process.env.DATABASE_URL!, { max: 4, connection: { TimeZone: "Asia/Kolkata" } });
  return { db: drizzle(state.client, { schema }) };
});
import { db } from "@/lib/db";
import { reserveScoutEvaluation, claimScoutEvaluation, markScoutEvaluationPhase, completeScoutEvaluation } from "../../src/lib/scouts/evaluation-receipts";

describe.skipIf(process.env.JOEY_INTEGRATION_TEST !== "true")("Real PostgreSQL Scout boundaries", () => {
  let tenantId: string;
  let scout: typeof scouts.$inferSelect;
  beforeAll(requireDisposableDatabase);
  beforeEach(async () => {
    tenantId = crypto.randomUUID();
    await db.insert(tenants).values({ id: tenantId, name: "Security acceptance", slug: tenantId });
    [scout] = await db.insert(scouts).values({ tenantId, name: "Daily", targetUrl: "https://instagram.com/example", goalCondition: "spike", pollIntervalMinutes: 1440 }).returning();
  });
  afterEach(async () => { await db.delete(tenants).where(eq(tenants.id, tenantId)); });
  afterAll(async () => { await state.client?.end(); });

  it("retains one distributed claim and fences replaced or expired leases in a non-UTC session", async () => {
    const receipts = await Promise.all(Array.from({ length: 6 }, () => reserveScoutEvaluation(scout, "same-event")));
    expect(new Set(receipts.map(r => r.id)).size).toBe(1);
    const claims = await Promise.all(receipts.map(claimScoutEvaluation));
    expect(claims.filter(c => c.claimed)).toHaveLength(1);
    const receipt = claims.find(c => c.claimed)!.receipt;
    const collected = await markScoutEvaluationPhase(receipt, "collected", []);
    await expect(markScoutEvaluationPhase({ ...collected, leaseToken: "stale-token" }, "judging")).rejects.toThrow("lease expired");
    await db.update(scoutEvaluations).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(scoutEvaluations.id, receipt.id));
    await expect(markScoutEvaluationPhase(collected, "judging")).rejects.toThrow("lease expired");
  });

  it("rolls back result, run, Scout update and notification when Stop arrives during completion", async () => {
    const claim = await claimScoutEvaluation(await reserveScoutEvaluation(scout, "completion"));
    const controller = new AbortController();
    let checks = 0;
    const guard = async () => { if (++checks === 2) controller.abort(new Error("Stopped")); controller.signal.throwIfAborted(); };
    const alert = { title: "Spike", detectedAt: new Date().toISOString(), targetUrl: scout.targetUrl, platform: scout.platform, goal: scout.goalCondition,
      changes: [{ type: "SPIKE" as const, label: "views", after: "100k", rationale: "goal met" }] };
    await expect(completeScoutEvaluation(claim.receipt, scout, { triggered: true, itemsFound: 1, alert }, guard)).rejects.toThrow("Stopped");
    expect((await db.query.scoutEvaluations.findFirst({ where: eq(scoutEvaluations.id, claim.receipt.id) }))?.status).toBe("running");
    expect((await db.query.scouts.findFirst({ where: eq(scouts.id, scout.id) }))?.lastPolledAt).toBeNull();
    expect(await db.select().from(scoutRuns).where(eq(scoutRuns.tenantId, tenantId))).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.tenantId, tenantId))).toHaveLength(0);
    expect(await completeScoutEvaluation(claim.receipt, scout, { triggered: false, itemsFound: 1 })).toMatchObject({ triggered: false });
  });

  it.each([0, -1, 14, 1441])("database rejects unsafe interval %s from alternate writers", async pollIntervalMinutes => {
    await expect(db.insert(scouts).values({ tenantId, name: "Unsafe", targetUrl: scout.targetUrl, goalCondition: "spike", pollIntervalMinutes })).rejects.toThrow();
  });

  it("migration quarantines unsafe legacy rows and preserves valid historical cadence", async () => {
    const migration = await readFile(new URL("../../src/lib/db/migrations/0056_scout_interval_bounds.sql", import.meta.url), "utf8");
    await state.client!.begin(async tx => {
      await tx.unsafe("CREATE TEMP TABLE scouts (id text, is_active boolean, poll_interval_minutes integer, updated_at timestamp) ON COMMIT DROP");
      await tx.unsafe("INSERT INTO scouts VALUES ('unsafe', true, -1, now()), ('valid', true, 120, now())");
      await tx.unsafe(migration);
      const rows = await tx.unsafe("SELECT id, is_active, poll_interval_minutes FROM scouts ORDER BY id");
      expect(rows).toEqual([
        { id: "unsafe", is_active: false, poll_interval_minutes: 1440 },
        { id: "valid", is_active: true, poll_interval_minutes: 120 },
      ]);
    });
  });

  it("does not queue paid rendering after Stop during a real PostgreSQL admission lock", async () => {
    vi.stubEnv("MEDIA_ENGINE_ENABLED", "true");
    const [flow] = await db.insert(flows).values({ tenantId, name: "Flow", graph: {} }).returning();
    const [asset] = await db.insert(assets).values({ tenantId, filename: "test.png", key: "version", mimeType: "image/png", size: 100, publicUrl: "https://example.test/test.png" }).returning();
    const spec = { version: 1, source: { kind: "flow", id: flow.id, revision: "run:node" }, template: "photo_headline", templateVersion: 1, format: "png", media: { id: asset.id, version: asset.key }, title: "Test", brand: { name: "Brand", handle: "@brand" } };
    const controller = new AbortController();
    let pending: Promise<unknown>;
    try {
      await state.client!.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`media:${tenantId}`}))`;
        const [{ pid }] = await tx`SELECT pg_backend_pid() AS pid`;
        // Attach a rejection handler immediately, before releasing the lock.
        pending = submitRender(tenantId, spec, { signal: controller.signal, dispatch: false }).catch(error => error);
        const deadline = Date.now() + 5000;
        let waiting = false;
        while (Date.now() < deadline) {
          const rows = await tx`SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
          if (rows.length) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
        controller.abort(new Error("Stopped while waiting for admission"));
      });
      expect(await pending!).toMatchObject({ message: "Stopped while waiting for admission" });
      expect(await db.select().from(mediaRenderJobs).where(eq(mediaRenderJobs.tenantId, tenantId))).toHaveLength(0);
      expect(await submitRender(tenantId, spec, { dispatch: false })).toMatchObject({ status: "queued" });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
