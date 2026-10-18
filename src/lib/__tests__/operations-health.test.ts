import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mock = vi.hoisted(() => ({ where: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: mock.where }) }) } }));
import { getOperationalHealth } from "../operations";

beforeEach(() => { mock.where.mockReset(); });
describe("operational health coverage", () => {
  it("counts Scout, render, publication and agency failures and scopes every query to the workspace", async () => {
    mock.where.mockImplementation(async () => [{ value: mock.where.mock.calls.length }]);
    const health = await getOperationalHealth("workspace-a", new Date("2026-10-19T00:00:00Z"));
    expect(health).toMatchObject({ scoutFailures24h: 9, scoutUncertain: 10, overdueScouts: 11, renderFailures24h: 12, stalledRenders: 13, publicationFailures: 29, pendingPublications: 33, agencyFailures24h: 18 });
    const queries = mock.where.mock.calls.map(([condition]) => new PgDialect().sqlToQuery(condition));
    expect(queries).toHaveLength(18);
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
  it("does not turn a failed health query into a clean report", async () => {
    mock.where.mockRejectedValue(new Error("database unavailable"));
    await expect(getOperationalHealth("workspace-a")).rejects.toThrow("database unavailable");
  });
});
