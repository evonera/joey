import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), setup: vi.fn(), reserve: vi.fn(), claim: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  query: { scoutEvaluations: { findMany: async () => [] } },
  select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: () => ({ limit: mocks.limit }) }) }), where: () => ({ orderBy: () => ({ limit: mocks.limit }) }) }) }),
  update: mocks.update,
} }));
vi.mock("../data-provider", () => ({ getScoutProviderSetup: mocks.setup }));
vi.mock("../evaluation-receipts", () => ({ reserveScoutEvaluation: mocks.reserve, SCOUT_DISPATCH_ATTEMPTS: 3 }));
import { dispatchScoutsTick } from "../scheduler";
describe("Scout scheduler readiness", () => {
  beforeEach(() => vi.clearAllMocks());
  it("leaves unconfigured Scouts waiting without creating failed scans or dispatching paid work", async () => {
    mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "a", tenantId: "tenant" }, { id: "b", tenantId: "tenant" }]);
    mocks.setup.mockResolvedValue({ ready: false });
    const dispatch = vi.fn();
    expect(await dispatchScoutsTick(dispatch)).toMatchObject({ checkedCount: 0, dispatchedCount: 0, blockedCount: 2 });
    expect(mocks.setup).toHaveBeenCalledTimes(1);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
