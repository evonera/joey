import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAdmittedFlowRun, startFlowRun } from "../run-flow-server";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), set: vi.fn(), execute: vi.fn() }));
vi.mock("../executor", () => ({ executeFlow: mocks.execute }));
vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
    update: () => ({ set: mocks.set }),
  },
}));
const flow = { id: "flow", tenantId: "tenant", graph: {} };

describe("Flow run cancellation admission and terminal state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: () => ({ returning: async () => [{ id: "run" }] }) });
    mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ id: "run" }] }) });
    mocks.execute.mockResolvedValue({ status: "succeeded", steps: [] });
  });
  it("rejects already-cancelled calls before creating a run", async () => {
    await expect(startFlowRun({ flow, trigger: "manual", signal: AbortSignal.abort(new Error("stopped")) })).rejects.toThrow("stopped");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("forwards signal to the executor and persists failure if cancelled in flight", async () => {
    const controller = new AbortController();
    mocks.execute.mockImplementationOnce((_graph, options) => {
      expect(options.signal).toBe(controller.signal);
      controller.abort(new Error("stopped"));
      return { status: "waiting_approval", steps: [] };
    });
    const result = await startFlowRun({ flow, trigger: "manual", signal: controller.signal });
    expect(result).toMatchObject({ status: "failed", persisted: true });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error: "Flow execution cancelled.", finishedAt: expect.any(Date) }));
  });
  it("finalizes already-admitted cancelled runs without executing them", async () => {
    expect(await executeAdmittedFlowRun({ flow, runId: "run", signal: AbortSignal.abort() })).toMatchObject({ status: "failed", persisted: true });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("retains ordinary run success", async () => {
    expect(await startFlowRun({ flow, trigger: "manual" })).toMatchObject({ status: "succeeded", persisted: true });
  });
});
