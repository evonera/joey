import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(), publish: vi.fn(), flows: vi.fn(), scouts: vi.fn(), telegram: vi.fn(), prune: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: mocks.claim }) }) }) } }));
vi.mock("@/lib/publisher-core", () => ({ publishDueDrafts: mocks.publish }));
vi.mock("../../../../agent/schedules/flows-tick", () => ({ runFlowsTick: mocks.flows }));
vi.mock("@/lib/scouts/evaluator", () => ({ runScoutsTick: mocks.scouts }));
vi.mock("@/lib/telegram-outbox", () => ({ processTelegramOutbox: mocks.telegram }));
vi.mock("@/lib/rate-limit", () => ({ pruneExpiredRateLimits: mocks.prune }));
vi.mock("@/lib/dispatch-claim", () => ({ withTimeout: (task: Promise<unknown>) => task }));
import { GET } from "./route";

describe("scheduler admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "scheduler-test-secret";
    mocks.claim.mockResolvedValue([{ tokenId: "internal:cron" }]);
    for (const task of [mocks.publish, mocks.flows, mocks.scouts, mocks.telegram, mocks.prune]) task.mockResolvedValue({});
  });
  const request = () => new Request("https://joey.example/api/cron", { headers: { authorization: "Bearer scheduler-test-secret" } });
  it("rejects unauthorized requests before admitting work", async () => {
    expect((await GET(new Request("https://joey.example/api/cron"))).status).toBe(401);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("does not execute a duplicate tick admitted by the other scheduler", async () => {
    mocks.claim.mockResolvedValueOnce([]);
    const result = await GET(request());
    expect(await result.json()).toEqual({ ok: true, skipped: "already_admitted" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("reports partial failure to the external scheduler while running independent tasks", async () => {
    mocks.flows.mockRejectedValueOnce(new Error("flow tick unavailable"));
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect((await result.json()).ok).toBe(false);
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.scouts).toHaveBeenCalledOnce();
  });
});
