import { describe, it, expect } from "vitest";
import { executeFlow } from "@/lib/flows/executor";
import type { FlowGraphDoc } from "@/lib/flows/types";

function doc(partial: Partial<FlowGraphDoc>): FlowGraphDoc {
  return { nodes: [], edges: [], ...partial };
}

const n = (id: string, type: string, config: Record<string, unknown> = {}) => ({
  id,
  type,
  config,
  position: { x: 0, y: 0 },
});

// Pure nodes only — no DB/network — so runs are fully deterministic.
async function run(graph: FlowGraphDoc, opts?: Partial<Parameters<typeof executeFlow>[1]>) {
  return executeFlow(graph, {
    tenantId: "t_test",
    runId: "r_test",
    flowId: "f_test",
    ...opts,
  });
}

describe("executeFlow", () => {
  it("runs a linear pipeline in order and produces deterministic output", async () => {
    const graph = doc({
      nodes: [
        n("t", "trigger.manual", { samplePayload: JSON.stringify([{ id: "a", views: 10 }, { id: "b", views: 50 }, { id: "c", views: 30 }]) }),
        n("s", "transform.sort", { field: "views", direction: "desc", limit: 2 }),
        n("d", "transform.dedupe", { field: "id" }),
      ],
      edges: [{ from: "t", to: "s" }, { from: "s", to: "d" }],
    });

    const first = await run(graph);
    const second = await run(graph);

    expect(first.status).toBe("succeeded");
    expect(first.outputs["d"]).toEqual([{ id: "b", views: 50 }, { id: "c", views: 30 }]);
    expect(second.outputs).toEqual(first.outputs);
    expect(second.steps.map((s) => s.status)).toEqual(second.steps.map((s) => s.status));
  });

  it("marks non-matching branches skipped via condition routing", async () => {
    const graph = doc({
      nodes: [
        n("t", "trigger.manual", { samplePayload: JSON.stringify({ score: 5 }) }),
        n("cond", "logic.condition", { field: "score", operator: "gt", value: "10" }),
        n("yes", "transform.dedupe", { field: "score" }),
        n("no", "transform.filter", { field: "score", operator: "exists" }),
      ],
      edges: [
        { from: "t", to: "cond" },
        { from: "cond", to: "yes", branch: "true" },
        { from: "cond", to: "no", branch: "false" },
      ],
    });

    const result = await run(graph);
    expect(result.status).toBe("succeeded");
    const byId = Object.fromEntries(result.steps.map((s) => [s.nodeId, s.status]));
    expect(byId["yes"]).toBe("skipped");
    expect(byId["no"]).toBe("succeeded");
  });

  it("fails the failed path and skips its downstream while other branches still run", async () => {
    const graph = doc({
      nodes: [
        n("t", "trigger.manual"),
        // llm node with an invalid schema string → deterministic failure before any network call
        n("bad", "ai.llm", { provider: "openai", model: "x", systemPrompt: "p", outputSchema: "{not-json" }),
        n("afterBad", "action.notify", { title: "never" }),
        n("ok", "transform.filter", { field: "a", operator: "exists" }),
      ],
      edges: [
        { from: "t", to: "bad" },
        { from: "t", to: "ok" },
        { from: "bad", to: "afterBad" },
      ],
    });

    const result = await run(graph);
    expect(result.status).toBe("failed");
    const byId = Object.fromEntries(result.steps.map((s) => [s.nodeId, s.status]));
    expect(byId["bad"]).toBe("failed");
    expect(byId["afterBad"]).toBe("skipped");
    expect(byId["ok"]).toBe("succeeded");
  });

  it("pauses at approval gates and resumes when pre-approved", async () => {
    const graph = doc({
      nodes: [
        n("t", "trigger.manual", { samplePayload: "hello" }),
        n("gate", "logic.approval", { prompt: "Send it?" }),
        n("out", "transform.filter", { field: "length", operator: "exists" }),
      ],
      edges: [{ from: "t", to: "gate" }, { from: "gate", to: "out" }],
    });

    const paused = await run(graph);
    expect(paused.status).toBe("waiting_approval");
    expect(paused.pendingApproval?.nodeId).toBe("gate");

    const resumed = await run(graph, { approvedNodeIds: ["gate"], cachedOutputs: { t: paused.outputs["t"] } });
    expect(resumed.status).toBe("succeeded");
  });

  it("fans out downstream per item for forEach nodes and aggregates sinks", async () => {
    const items = [
      { name: "x", keep: true },
      { name: "y", keep: false },
      { name: "z", keep: true },
    ];
    const graph = doc({
      nodes: [
        n("t", "trigger.manual", { samplePayload: JSON.stringify(items) }),
        n("loop", "logic.loop", {}),
        n("cond", "logic.condition", { field: "keep", operator: "eq", value: "true" }),
        n("sinkTrue", "transform.dedupe", { field: "name" }),
        n("sinkFalse", "transform.filter", { field: "name", operator: "exists" }),
      ],
      edges: [
        { from: "t", to: "loop" },
        { from: "loop", to: "cond" },
        { from: "cond", to: "sinkTrue", branch: "true" },
        { from: "cond", to: "sinkFalse", branch: "false" },
      ],
    });

    const result = await run(graph);
    expect(result.status).toBe("succeeded");
    // Per-item the chain receives a single object. Aggregation is per sink:
    // true-branch collects kept items, false-branch collects rejected ones.
    expect(result.outputs["__fanout:loop"]).toEqual({
      sinkTrue: [{ name: "x", keep: true }, { name: "z", keep: true }],
      sinkFalse: [{ name: "y", keep: false }],
    });
    const byId = Object.fromEntries(result.steps.map((s) => [s.nodeId, s.status]));
    expect(byId["cond"]).toBe("succeeded");
  });

  it("rejects unknown node types as failures", async () => {
    const graph = doc({
      nodes: [n("t", "trigger.manual"), n("x", "definitely.not.real")],
      edges: [{ from: "t", to: "x" }],
    });
    const result = await run(graph);
    expect(result.status).toBe("failed");
  });
});
