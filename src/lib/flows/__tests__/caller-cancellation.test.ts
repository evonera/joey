import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeFlow } from "../executor";
import type { NodeContext } from "../node-contract";

const nodes = vi.hoisted(() => ({ execute: vi.fn(), sink: vi.fn() }));
vi.mock("../registry", () => ({
  getNode: (type: string) => ({
    type, label: type, configSchema: z.object({}), isTrigger: type === "trigger",
    execute: type === "sink" ? nodes.sink : nodes.execute,
  }),
}));

const graph = {
  nodes: ["trigger", "sink"].map((type) => ({ id: type, type, config: {}, position: { x: 0, y: 0 } })),
  edges: [{ from: "trigger", to: "sink" }],
};
const options = { tenantId: "tenant", flowId: "flow", runId: "run" };

describe("Flow caller cancellation", () => {
  beforeEach(() => { vi.clearAllMocks(); nodes.execute.mockResolvedValue({ output: "value" }); nodes.sink.mockResolvedValue({ output: "sent" }); });

  it("does not dispatch any node for an already-aborted caller", async () => {
    const result = await executeFlow(graph, { ...options, signal: AbortSignal.abort(new Error("user stopped")) });
    expect(result).toMatchObject({ status: "failed", error: "user stopped" });
    expect(nodes.execute).not.toHaveBeenCalled();
    expect(nodes.sink).not.toHaveBeenCalled();
  });
  it("propagates a custom cancellation reason into active node work and stops downstream effects", async () => {
    const controller = new AbortController();
    nodes.execute.mockImplementationOnce((_input: unknown, _config: unknown, ctx: NodeContext) => {
      controller.abort(new Error("user stopped"));
      ctx.signal!.throwIfAborted();
    });
    const result = await executeFlow(graph, { ...options, signal: controller.signal });
    expect(result).toMatchObject({ status: "failed", error: "user stopped" });
    expect(nodes.sink).not.toHaveBeenCalled();
    expect((nodes.execute.mock.calls[0][2] as NodeContext).signal!.aborted).toBe(true);
  });
  it("retains internal heartbeat fencing when an external signal is present", async () => {
    const controller = new AbortController();
    const result = await executeFlow(graph, { ...options, signal: controller.signal }, {
      onHeartbeat: () => { throw new Error("Execution fenced"); },
    });
    expect(result).toMatchObject({ status: "failed", error: "Execution fenced" });
    expect(nodes.execute).not.toHaveBeenCalled();
    expect(controller.signal.aborted).toBe(false);
  });
  it("keeps ordinary caller execution intact", async () => {
    const result = await executeFlow(graph, { ...options, signal: new AbortController().signal });
    expect(result.status).toBe("succeeded");
    expect(nodes.sink).toHaveBeenCalledTimes(1);
  });
});
