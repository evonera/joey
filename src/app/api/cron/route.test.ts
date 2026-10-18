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
  it("reports a rejected Scout workflow handoff even when dispatch returns a structured result", async () => {
    mocks.scouts.mockResolvedValueOnce({ dispatchedCount: 0, error: "Scout dispatch failed; bounded retry is scheduled." });
    const result = await GET(request());
    expect(result.status).toBe(503);
    const body = await result.json();
    expect(body.ok).toBe(false);
    expect(body.summary.find((task: { task: string }) => task.task === "scoutsTick")).toEqual({ task: "scoutsTick", status: "fulfilled", error: "Task reported failed operations" });
    expect(mocks.publish).toHaveBeenCalledOnce();
  });
  it("reports caught Flow maintenance failures without stopping other cron tasks", async () => {
    mocks.flows.mockResolvedValueOnce({ failed: 1, flowFailures: 0, subProcessors: [{ task: "media-render-settlement", status: "failed" }] });
    const result = await GET(request());
    expect(result.status).toBe(503);
    const body = await result.json();
    expect(body.ok).toBe(false);
    expect(body.summary.find((task: { task: string }) => task.task === "flowsTick").error).toBe("Task reported failed operations");
    expect(mocks.scouts).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledOnce();
  });
  it("keeps normal unconfigured sources and empty error values distinct from dispatch failure", async () => {
    mocks.scouts.mockResolvedValueOnce({ dispatchedCount: 0, blockedCount: 2, error: undefined });
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect((await result.json()).ok).toBe(true);
  });
});
