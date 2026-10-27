import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mock = vi.hoisted(() => ({ where: vi.fn(), scouts: vi.fn(), billing: vi.fn(), setup: vi.fn() }));
vi.mock("@/lib/billing", () => ({ checkUsageLimits: mock.billing }));
vi.mock("@/lib/scouts/data-provider", () => ({ getScoutProviderSetup: mock.setup }));
vi.mock("@/lib/db", () => ({ db: { query: { scouts: { findMany: mock.scouts } }, select: () => ({ from: () => ({ where: mock.where }) }) } }));
import { getOperationalHealth } from "../operations";

beforeEach(() => {
  vi.resetAllMocks();
  mock.scouts.mockResolvedValue([]);
  mock.billing.mockResolvedValue({ allowsAutonomousCadence: true });
  mock.setup.mockResolvedValue({ ready: true });
});
describe("operational health coverage", () => {
  it("counts Scout, render, publication and agency failures and scopes every query to the workspace", async () => {
    mock.where.mockImplementation(async () => [{ value: mock.where.mock.calls.length }]);
    const health = await getOperationalHealth("workspace-a", new Date("2026-10-19T00:00:00Z"));
    expect(health).toMatchObject({ scoutFailures24h: 9, scoutUncertain: 10, overdueScouts: 11, renderFailures24h: 12, stalledRenders: 13, publicationFailures: 29, pendingPublications: 33, agencyFailures24h: 18 });
    const queries = mock.where.mock.calls.map(([condition]) => new PgDialect().sqlToQuery(condition));
    expect(queries).toHaveLength(20);
    for (const query of queries) {
      expect(query.sql).toContain('"tenant_id" =');
      expect(query.params).toContain("workspace-a");
    }
    expect(queries[10].sql).toContain('"poll_interval_minutes" + 15');
    expect(queries[10].sql).toContain('COALESCE');
    expect(queries[15].sql).toContain('"scheduled_for"');
    expect(queries[15].sql).toContain('GREATEST');
    expect(queries[15].sql).toContain('^claimed:[0-9]{13}$');
    expect(queries[15].sql).toContain('"posts"."tenant_id" = "drafts"."tenant_id"');
    expect(queries[15].sql).not.toContain('"drafts"."created_at"');
    expect(queries[16].sql).toContain('"scheduled_for"');
  });
  it("counts blocked paid/provider readiness even when scheduler backoff has just advanced the last poll", async () => {
    mock.where.mockResolvedValue([{ value: 0 }]);
    mock.scouts.mockResolvedValue([{ id: "blocked", lastPolledAt: new Date() }, { id: "ready", lastPolledAt: new Date() }]);
    mock.setup.mockImplementation(async (_tenant, source) => ({ ready: source.id === "ready" }));
    const health = await getOperationalHealth("workspace-a");
    expect(health.blockedScouts).toBe(1);
    expect(mock.setup).toHaveBeenCalledWith("workspace-a", expect.objectContaining({ id: "blocked" }));
    mock.billing.mockResolvedValue({ allowsAutonomousCadence: false });
    mock.setup.mockClear();
    expect((await getOperationalHealth("workspace-a")).blockedScouts).toBe(2);
    expect(mock.setup).not.toHaveBeenCalled();
  });
  it("bounds readiness checks and explicitly reports sources outside the checked sample", async () => {
    mock.where.mockResolvedValue([{ value: 103 }]);
    mock.scouts.mockResolvedValue(Array.from({ length: 100 }, (_, id) => ({ id: String(id) })));
    const health = await getOperationalHealth("workspace-a");
    expect(health.scoutReadinessUnchecked).toBe(3);
    expect(mock.scouts).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
    expect(mock.setup).toHaveBeenCalledTimes(100);
    const condition = mock.scouts.mock.calls[0][0].where;
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"tenant_id" =');
    expect(query.params).toContain("workspace-a");
  });
  it("does not turn a failed health query into a clean report", async () => {
    mock.where.mockRejectedValue(new Error("database unavailable"));
    await expect(getOperationalHealth("workspace-a")).rejects.toThrow("database unavailable");
  });
});
