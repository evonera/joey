import { describe, expect, it, vi, beforeEach } from "vitest";
import listFlowsTool from "../../agent/tools/list_flows";
import triggerFlowTool from "../../agent/tools/trigger_flow";

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

    const res = (await listFlowsTool.execute({ status: "all" }, fakeCtx)) as any;
    expect(res.count).toBe(2);
    expect(res.flows[0].id).toBe("f-1");
    expect(res.flows[0].status).toBe("active");
  });

  it("trigger_flow starts a flow run when flow exists", async () => {
    mockFindFirstFlow.mockResolvedValueOnce({
      id: "f-10",
      tenantId: "tenant-flow-1",
      name: "Daily Digest",
      status: "active",
    });

    mockStartFlowRun.mockResolvedValueOnce({
      runId: "run-99",
      status: "running",
      nodesExecuted: 0,
      totalNodes: 3,
      draftsCreated: 0,
    });

    const res = (await triggerFlowTool.execute({ flowIdOrName: "f-10" }, fakeCtx)) as any;
    expect(res.success).toBe(true);
    expect(res.runId).toBe("run-99");
    expect(mockStartFlowRun).toHaveBeenCalledWith({
      flow: expect.objectContaining({ id: "f-10" }),
      trigger: "manual",
      triggerPayload: null,
    });
  });
});
