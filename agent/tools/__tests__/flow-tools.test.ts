import { describe, expect, it, vi, beforeEach } from "vitest";
import listFlowsTool from "@/../agent/tools/list_flows";
import triggerFlowTool from "@/../agent/tools/trigger_flow";

const mockFindManyFlows = vi.fn();
const mockFindFirstFlow = vi.fn();
const mockStartFlowRun = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      flows: {
        findMany: (...args: any[]) => mockFindManyFlows(...args),
        findFirst: (...args: any[]) => mockFindFirstFlow(...args),
      },
    },
  },
}));

vi.mock("@/lib/flows/run-flow-server", () => ({
  startFlowRun: (...args: any[]) => mockStartFlowRun(...args),
}));

describe("agent flow tools", () => {
  const fakeCtx = {
    session: {
      auth: {
        current: {
          attributes: {
            tenantId: "tenant-flow-1",
          },
        },
      },
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list_flows returns formatted summaries with status filtering", async () => {
    mockFindManyFlows.mockResolvedValueOnce([
      {
        id: "f-1",
        name: "Flow 1",
        description: "Curator",
        status: "active",
        executionRevision: 1,
        lastTickedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: "f-2",
        name: "Flow 2",
        description: "Syndicator",
        status: "draft",
        executionRevision: 1,
        lastTickedAt: null,
        createdAt: new Date(),
      },
    ]);

    const resultAll = await (listFlowsTool.execute as any)({ status: "all" }, fakeCtx);
    expect(resultAll.count).toBe(2);
    expect(resultAll.flows[0].name).toBe("Flow 1");

    mockFindManyFlows.mockResolvedValueOnce([
      {
        id: "f-1",
        name: "Flow 1",
        description: "Curator",
        status: "active",
        executionRevision: 1,
        lastTickedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: "f-2",
        name: "Flow 2",
        description: "Syndicator",
        status: "draft",
        executionRevision: 1,
        lastTickedAt: null,
        createdAt: new Date(),
      },
    ]);

    const resultActive = await (listFlowsTool.execute as any)({ status: "active" }, fakeCtx);
    expect(resultActive.count).toBe(1);
    expect(resultActive.flows[0].name).toBe("Flow 1");
  });

  it("trigger_flow starts a manual flow execution by name or ID", async () => {
    mockFindFirstFlow.mockResolvedValueOnce({
      id: "f-123",
      name: "Daily AI News Curator",
      tenantId: "tenant-flow-1",
    });

    mockStartFlowRun.mockResolvedValueOnce({
      runId: "run-456",
      persisted: true,
      status: "running",
    });

    const result = await (triggerFlowTool.execute as any)(
      { flowIdOrName: "Daily AI News Curator" },
      fakeCtx
    );

    expect(result.success).toBe(true);
    expect(result.runId).toBe("run-456");
    expect(mockStartFlowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "manual",
        flow: expect.objectContaining({ id: "f-123" }),
      })
    );
  });
});
