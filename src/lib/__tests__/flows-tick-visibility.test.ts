import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ cleanup: vi.fn(), webhooks: vi.fn(), renders: vi.fn(), zernio: vi.fn(), dms: vi.fn(), analytics: vi.fn(), optimize: vi.fn(), event: vi.fn(), flows: vi.fn(), execute: vi.fn(), admit: vi.fn(), node: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { flowRuns: { findMany: async () => [], findFirst: async () => undefined }, flows: { findMany: mock.flows } }, update: () => ({ set: () => ({ where: async () => [] }) }) } }));
vi.mock("@/lib/storage-cleanup", () => ({ processR2CleanupTasks: mock.cleanup }));
vi.mock("@/lib/flows/incoming-webhooks", () => ({ recoverStaleWebhookDeliveries: mock.webhooks }));
vi.mock("@/lib/media-engine/theme-adapter", () => ({ settleCompletedThemeRenders: mock.renders }));
vi.mock("@/lib/zernio-webhook-processing", () => ({ recoverZernioWebhookEvents: mock.zernio }));
vi.mock("@/lib/engagement-inbox", () => ({ processThemeStudioDmRetries: mock.dms }));
vi.mock("@/lib/theme-studio/learning/analytics-sync", () => ({ processThemeStudioAnalyticsSync: mock.analytics }));
vi.mock("@/lib/theme-studio/learning/recipe-optimizer", () => ({ processThemeStudioOptimization: mock.optimize }));
vi.mock("@/lib/operations-log", () => ({ operationalEvent: mock.event }));
vi.mock("@/lib/flows/registry", () => ({ getNode: mock.node }));
vi.mock("@/lib/flows/run-flow-server", () => ({ executeAdmittedFlowRun: mock.execute }));
vi.mock("@/lib/flows/scheduled-admission", () => ({ admitPaidScheduledFlow: mock.admit }));
import schedule, { runFlowsTick } from "../../../agent/schedules/flows-tick";

beforeEach(() => {
  vi.resetAllMocks();
  mock.flows.mockResolvedValue([]);
  mock.node.mockReturnValue({ configSchema: { safeParse: () => ({ success: true, data: { intervalMinutes: 60 } }) } });
  mock.admit.mockResolvedValue({ id: "run" });
  for (const task of [mock.cleanup, mock.webhooks, mock.renders, mock.zernio, mock.dms, mock.analytics, mock.optimize]) task.mockResolvedValue(undefined);
});
describe("Flow maintenance failure reporting", () => {
  it("retains a caught failure in its result while completing every independent processor", async () => {
    mock.renders.mockRejectedValue(new Error("render settlement unavailable"));
    const result = await runFlowsTick();
    expect(result.failed).toBe(1);
    expect(result.subProcessors.find(task => task.task === "media-render-settlement")).toEqual({ task: "media-render-settlement", status: "failed" });
    for (const task of [mock.cleanup, mock.webhooks, mock.renders, mock.zernio, mock.dms, mock.analytics, mock.optimize]) expect(task).toHaveBeenCalledOnce();
    expect(mock.event).toHaveBeenCalledWith("error", "flows_tick.subprocessor_failed", expect.objectContaining({ task: "media-render-settlement" }));
  });
  it("does not call a structured subprocessor failure successful", async () => {
    mock.zernio.mockResolvedValue({ failed: 2 });
    expect((await runFlowsTick()).failed).toBe(1);
  });
  it("also fails the native Eve schedule after independent processing has completed", async () => {
    mock.renders.mockRejectedValue(new Error("settlement unavailable"));
    await expect(schedule.run()).rejects.toThrow("reported failed operations");
    expect(mock.optimize).toHaveBeenCalledOnce();
  });
  it.each([["failed", 1], ["waiting_approval", 0], ["succeeded", 0]])("counts persisted %s flow outcomes correctly", async (status, expected) => {
    mock.flows.mockResolvedValue([{ id: "flow", tenantId: "workspace", graph: { nodes: [{ id: "schedule", type: "trigger.schedule" }] } }]);
    mock.execute.mockResolvedValue({ runId: "run", status, persisted: true });
    expect((await runFlowsTick()).flowFailures).toBe(expected);
    expect(mock.execute).toHaveBeenCalledOnce();
  });
  it("reports a clean tick only when all processors complete", async () => {
    const result = await runFlowsTick();
    expect(result.failed).toBe(0);
    expect(result.subProcessors).toHaveLength(7);
    expect(result.subProcessors.every(task => task.status === "fulfilled")).toBe(true);
  });
});
