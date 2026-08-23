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

describe("cached replay semantics", () => {
  const branchGraph = {
    nodes: [
      { id: "t", type: "trigger.manual", config: { samplePayload: JSON.stringify({ score: 5 }) }, position: { x: 0, y: 0 } },
      { id: "cond", type: "logic.condition", config: { field: "score", operator: "gt", value: "10" }, position: { x: 0, y: 0 } },
      { id: "yes", type: "transform.dedupe", config: { field: "score" }, position: { x: 0, y: 0 } },
      { id: "no", type: "transform.filter", config: { field: "score", operator: "exists" }, position: { x: 0, y: 0 } },
    ],
    edges: [
      { from: "t", to: "cond" },
      { from: "cond", to: "yes", branch: "true" },
      { from: "cond", to: "no", branch: "false" },
    ],
  };

  it("resume with cached condition output preserves the original branch routing", async () => {
    // Simulate flows.ts resume: seed cache from persisted steps, where cond
    // succeeded with branch=false recorded.
    const result = await run(branchGraph as never, {
      cachedOutputs: {
        t: { score: 5 },
        cond: { __branch: "false", value: { score: 5 } },
      },
    });

    expect(result.status).toBe("succeeded");
    const byId = Object.fromEntries(result.steps.map((s) => [s.nodeId, s.status]));
    // The originally unselected branch must NOT execute on replay.
    expect(byId["yes"]).toBe("skipped");
    expect(byId["no"]).toBe("succeeded");
  });

  it("cached forEach still fans out per item on restart-from-failed", async () => {
    const items = [{ n: 1 }, { n: 2 }];
    const graph = {
      nodes: [
        { id: "t", type: "trigger.manual", config: { samplePayload: JSON.stringify(items) }, position: { x: 0, y: 0 } },
        { id: "loop", type: "logic.loop", config: {}, position: { x: 0, y: 0 } },
        { id: "sink", type: "transform.dedupe", config: { field: "n" }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { from: "t", to: "loop" },
        { from: "loop", to: "sink" },
      ],
    };

    const result = await run(graph as never, {
      cachedOutputs: {
        t: items,
        loop: items, // loop already succeeded before the downstream failure
      },
    });

    expect(result.status).toBe("succeeded");
    // Fan-out must have run per item despite the loop being cache-seeded
    // (per-sink aggregation shape).
    expect(result.outputs["__fanout:loop"]).toEqual({ sink: items });
    const sink = result.steps.find((s) => s.nodeId === "sink");
    expect(sink?.status).toBe("succeeded");
  });
});

describe("repeated replay + deep cached fan-out", () => {
  it("synthetic cached steps retain branch for SECOND-generation replays", async () => {
    const graph = {
      nodes: [
        { id: "t", type: "trigger.manual", config: { samplePayload: JSON.stringify({ score: 5 }) }, position: { x: 0, y: 0 } },
        { id: "cond", type: "logic.condition", config: { field: "score", operator: "gt", value: "10" }, position: { x: 0, y: 0 } },
        { id: "no", type: "transform.filter", config: { field: "score", operator: "exists" }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { from: "t", to: "cond" },
        { from: "cond", to: "no", branch: "false" },
      ],
    };

    // Generation 1: seed with wrapped output (as flows.ts resume does).
    const g1 = await run(graph as never, {
      cachedOutputs: {
        t: { score: 5 },
        cond: { __branch: "false", value: { score: 5 } },
      },
    });
    const condStep = g1.steps.find((s) => s.nodeId === "cond");
    expect(condStep?.branch).toBe("false");

    // Generation 2: rebuild cache the way flows.ts does (branch-aware) and
    // confirm routing STILL holds — this is where the old code broke.
    const g2 = await run(graph as never, {
      cachedOutputs: {
        t: g1.outputs["t"],
        cond: condStep?.branch
          ? { __branch: condStep.branch, value: condStep.output }
          : condStep?.output,
      },
    });
    expect(g2.status).toBe("succeeded");
    expect(g2.steps.find((s) => s.nodeId === "no")?.status).toBe("succeeded");
  });

  it("cached fanout triggers when a DEEPER descendant failed (immediate child succeeded)", async () => {
    // loop -> mid (succeeds per item, passthrough object) is impossible with
    // pure nodes; emulate by seeding loop+mid as succeeded and leaving sink
    // unseeded (simulating its earlier failure).
    const items = [{ n: 1 }, { n: 2 }];
    const graph = {
      nodes: [
        { id: "t", type: "trigger.manual", config: {}, position: { x: 0, y: 0 } },
        { id: "loop", type: "logic.loop", config: {}, position: { x: 0, y: 0 } },
        { id: "mid", type: "transform.filter", config: { field: "n", operator: "exists" }, position: { x: 0, y: 0 } },
        { id: "sink", type: "transform.dedupe", config: { field: "n" }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { from: "t", to: "loop" },
        { from: "loop", to: "mid" },
        { from: "mid", to: "sink" },
      ],
    };

    const result = await run(graph as never, {
      cachedOutputs: {
        t: items,
        loop: items,
        mid: items[0], // immediate child cached-succeeded (last item)
        // sink NOT seeded → failed earlier
      },
    });

    expect(result.status).toBe("succeeded");
    // Per-item fan-out ran; per-sink aggregate reflects both items.
    expect(result.outputs["__fanout:loop"]).toEqual({
      sink: [{ n: 1 }, { n: 2 }],
    });
  });
});

describe("cached fan-out trigger precision (round 4)", () => {
  const loopCondGraph = (items: unknown[]) => ({
    nodes: [
      { id: "t", type: "trigger.manual", config: { samplePayload: JSON.stringify(items) }, position: { x: 0, y: 0 } },
      { id: "loop", type: "logic.loop", config: {}, position: { x: 0, y: 0 } },
      { id: "cond", type: "logic.condition", config: { field: "go", operator: "eq", value: "true" }, position: { x: 0, y: 0 } },
      { id: "sinkT", type: "transform.dedupe", config: { field: "n" }, position: { x: 0, y: 0 } },
    ],
    edges: [
      { from: "t", to: "loop" },
      { from: "loop", to: "cond" },
      { from: "cond", to: "sinkT", branch: "true" },
    ],
  });

  it("does NOT retrigger fan-out when the only uncached descendant is a clean branch-skip", async () => {
    const items = [{ go: true, n: 1 }];
    // Seed: loop+cond+sinkT all succeeded; the unselected-branch sink is
    // absent entirely — nothing unfinished exists.
    const result = await run(loopCondGraph(items) as never, {
      cachedOutputs: {
        t: items,
        loop: items,
        cond: { __branch: "true", value: items[0] },
        sinkT: items[0],
      },
    });

    expect(result.status).toBe("succeeded");
    expect(result.outputs["__fanout:loop"]).toBeUndefined(); // no re-run
    expect(result.steps.find((s) => s.nodeId === "sinkT")?.output).toEqual(items[0]);
  });

  it("DOES retrigger fan-out when a failure-skipped descendant exists", async () => {
    const items = [{ go: true, n: 1 }];
    // Seed mirrors a failed original run: sink was marked skipped by
    // skipDownstream, carrying the failure marker as its error.
    const result = await run(loopCondGraph(items) as never, {
      cachedOutputs: {
        t: items,
        loop: items,
        cond: { __branch: "true", value: items[0] },
      },
    });

    // Fan-out ran per item; aggregate present via fresh sink execution.
    expect(result.outputs["__fanout:loop"]).toEqual({ sinkT: [items[0]] });
  });
});
