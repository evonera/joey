import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), setup: vi.fn(), reserve: vi.fn(), claim: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  query: { scoutEvaluations: { findMany: async () => [] } },
  select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: () => ({ limit: mocks.limit }) }) }), where: () => ({ orderBy: () => ({ limit: mocks.limit }) }) }) }),
  update: mocks.update,
} }));
vi.mock("../data-provider", () => ({ getScoutProviderSetup: mocks.setup }));
vi.mock("../evaluation-receipts", () => ({ reserveScoutEvaluation: mocks.reserve, SCOUT_DISPATCH_ATTEMPTS: 3 }));
import { dispatchScoutsTick, SCOUT_SOURCE_SCAN_LIMIT } from "../scheduler";
const source = (id: string, platform = "instagram") => ({ id, tenantId: "tenant", platform, targetUrl: `https://example.com/${id}/feed`, goalCondition: "New source", pollIntervalMinutes: 60, updatedAt: new Date() });
describe("Scout scheduler readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockImplementation(() => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }));
  });
  it("leaves unconfigured Scouts waiting without creating failed scans or dispatching paid work", async () => {
    mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([source("a"), source("b")]);
    mocks.setup.mockResolvedValue({ ready: false });
    const dispatch = vi.fn();
    expect(await dispatchScoutsTick(dispatch)).toMatchObject({ checkedCount: 0, dispatchedCount: 0, blockedCount: 2 });
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("fills a bounded batch with RSS sources past a full page of unavailable social sources", async () => {
    const pending: Array<Record<string, unknown>> = [];
    const writes: Array<Record<string, unknown>> = [];
    mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([
      ...Array.from({ length: 25 }, (_, index) => source(`social-${index}`)),
      ...Array.from({ length: 26 }, (_, index) => source(`rss-${index}`, "rss")),
    ]);
    mocks.setup.mockImplementation(async (_tenant, request) => ({ ready: request.platform === "rss" }));
    mocks.reserve.mockImplementation(async scout => {
      const receipt = { id: scout.id, scoutId: scout.id, tenantId: scout.tenantId, status: "pending", dispatchAttempts: 0, nextDispatchAt: new Date() };
      pending.push(receipt);
      return receipt;
    });
    mocks.update.mockImplementation(() => ({ set: (values: Record<string, unknown>) => {
      writes.push(values);
      return { where: () => ({ returning: async () => [{ ...pending.shift(), dispatchAttempts: 1, dispatchLeaseUntil: new Date() }] }) };
    } }));
    const dispatch = vi.fn();
    expect(await dispatchScoutsTick(dispatch)).toMatchObject({ dispatchedCount: 25, blockedCount: 25 });
    expect(mocks.limit).toHaveBeenNthCalledWith(1, SCOUT_SOURCE_SCAN_LIMIT);
    expect(mocks.limit).toHaveBeenNthCalledWith(2, SCOUT_SOURCE_SCAN_LIMIT);
    expect(mocks.reserve).toHaveBeenCalledTimes(25);
    expect(mocks.setup).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0]).toHaveLength(25);
    expect(dispatch.mock.calls[0][0].every((job: { scoutId: string }) => job.scoutId.startsWith("rss-"))).toBe(true);
    expect(writes.filter(value => value.lastPolledAt instanceof Date)).toHaveLength(25);
  });
});
