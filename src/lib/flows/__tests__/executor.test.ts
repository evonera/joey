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


// Build cachedSteps entries the way flows.ts persists them.
const step = (nodeId: string, type: string, extra: Record<string, unknown> = {}) => ({
  nodeId,
  type,
  status: "succeeded" as const,
  ...extra,
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

    const resumed = await run(graph, {
      approvedNodeIds: ["gate"],
      cachedSteps: [step("t", "trigger.manual", { output: paused.outputs["t"] })],
    });
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
      cachedSteps: [
        step("t", "trigger.manual", { output: { score: 5 } }),
        step("cond", "logic.condition", { output: { score: 5 }, branch: "false" }),
      ],
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
      cachedSteps: [
        step("t", "trigger.manual", { output: items }),
        step("loop", "logic.loop", { output: items }), // succeeded pre-failure
      ],
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
      cachedSteps: [
        step("t", "trigger.manual", { output: { score: 5 } }),
        step("cond", "logic.condition", { output: { score: 5 }, branch: "false" }),
      ],
    });
    const condStep = g1.steps.find((s) => s.nodeId === "cond");
    expect(condStep?.branch).toBe("false");

    // Generation 2: rebuild cache the way flows.ts does (branch-aware) and
    // confirm routing STILL holds — this is where the old code broke.
    const g2 = await run(graph as never, {
      cachedSteps: [
        step("t", "trigger.manual", { output: g1.outputs["t"] }),
        condStep?.branch !== undefined
          ? step("cond", "logic.condition", { output: condStep.output, branch: condStep.branch })
          : step("cond", "logic.condition", { output: condStep?.output ?? null }),
      ],
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
      cachedSteps: [
        step("t", "trigger.manual", { output: items }),
        step("loop", "logic.loop", { output: items }),
        step("mid", "transform.filter", { output: items[0] }), // deeper sink failed
      ],
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
      cachedSteps: [
        step("t", "trigger.manual", { output: items }),
        step("loop", "logic.loop", { output: items }),
        step("cond", "logic.condition", { output: items[0], branch: "true" }),
        step("sinkT", "transform.dedupe", { output: items[0] }),
        // clean branch-exclusion skip survives replay and is ignored:
        { nodeId: "sinkF", type: "transform.filter", status: "skipped" as const, cached: true },
      ],
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
      cachedSteps: [
        step("t", "trigger.manual", { output: items }),
        step("loop", "logic.loop", { output: items }),
        step("cond", "logic.condition", { output: items[0], branch: "true" }),
        { nodeId: "sinkT", type: "transform.dedupe", status: "skipped" as const, error: "Skipped: upstream node failed.", cached: true },
      ],
    });

    // Fan-out ran per item; aggregate present via fresh sink execution.
    expect(result.outputs["__fanout:loop"]).toEqual({ sinkT: [items[0]] });
  });

  it("persists checkpoint of succeeded predecessor nodes within a failed item and reuses them on restart", async () => {
    // Pipeline: loop -> stepA (succeeds) -> stepB (fails on first run)
    const items = [{ id: 1 }, { id: 2 }];
    const graph = doc({
      nodes: [
        n("t", "trigger.manual", { samplePayload: JSON.stringify(items) }),
        n("loop", "logic.loop"),
        n("stepA", "transform.dedupe", { field: "id" }),
        // Invalid schema causes deterministic failure
        n("stepB", "ai.llm", { provider: "openai", model: "x", systemPrompt: "p", outputSchema: "{invalid-json" }),
      ],
      edges: [
        { from: "t", to: "loop" },
        { from: "loop", to: "stepA" },
        { from: "stepA", to: "stepB" },
      ],
    });

    let savedFanoutProgress: Record<string, Record<string, unknown>> = {};
    const firstRun = await executeFlow(
      graph,
      { tenantId: "t", runId: "r1", flowId: "f" },
      {
        onFanoutProgress: (p) => {
          savedFanoutProgress = { ...p };
        },
      },
    );

    expect(firstRun.status).toBe("failed");
    // stepA succeeded for item 0 before stepB failed, so item 0 checkpoint MUST contain stepA!
    expect(savedFanoutProgress["0"]).toBeDefined();
    expect(savedFanoutProgress["0"]["stepA"]).toEqual({ id: 1 });

    // Now restart the run with a fixed graph and the saved fanoutProgress
    const fixedGraph = doc({
      nodes: [
        n("t", "trigger.manual", { samplePayload: JSON.stringify(items) }),
        n("loop", "logic.loop"),
        n("stepA", "transform.dedupe", { field: "id" }),
        n("stepB", "transform.filter", { field: "id", operator: "exists" }),
      ],
      edges: [
        { from: "t", to: "loop" },
        { from: "loop", to: "stepA" },
        { from: "stepA", to: "stepB" },
      ],
    });

    const secondRun = await executeFlow(
      fixedGraph,
      {
        tenantId: "t",
        runId: "r2",
        flowId: "f",
        cachedSteps: [
          step("t", "trigger.manual", { output: items }),
          step("loop", "logic.loop", { output: items }),
        ],
        fanoutProgress: savedFanoutProgress,
      },
    );

    expect(secondRun.status).toBe("succeeded");
    expect(secondRun.outputs["__fanout:loop"]).toEqual({
      stepB: [{ id: 1 }, { id: 2 }],
    });
  });

  it("pulses onHeartbeat port during node execution", async () => {
    const graph = doc({
      nodes: [
        n("t", "trigger.manual", { samplePayload: JSON.stringify({ hello: "world" }) }),
        n("d", "transform.dedupe", { field: "hello" }),
      ],
      edges: [{ from: "t", to: "d" }],
    });

    let heartbeatCount = 0;
    const result = await executeFlow(
      graph,
      { tenantId: "t", runId: "r1", flowId: "f" },
      {
        onHeartbeat: () => {
          heartbeatCount++;
        },
      },
    );

    expect(result.status).toBe("succeeded");
    expect(heartbeatCount).toBeGreaterThan(0);
  });

  it("preserves condition branch routing when restored from fanoutProgress checkpoint", async () => {
    // Loop -> Cond -> (true -> SinkTrue, false -> SinkFalse)
    const items = [{ active: true, name: "item1" }];
    const graph = doc({
      nodes: [
        n("t", "trigger.manual", { samplePayload: JSON.stringify(items) }),
        n("loop", "logic.loop"),
        n("cond", "logic.condition", { field: "active", operator: "is_true" }),
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

    // Provide pre-saved fanout checkpoint where cond evaluated to "true"
    const savedFanoutProgress = {
      "0": {
        cond: { __branch: "true", value: items[0] },
      },
    };

    const result = await executeFlow(
      graph,
      {
        tenantId: "t",
        runId: "r1",
        flowId: "f",
        cachedSteps: [
          step("t", "trigger.manual", { output: items }),
          step("loop", "logic.loop", { output: items }),
        ],
        fanoutProgress: savedFanoutProgress,
      },
    );

    expect(result.status).toBe("succeeded");
    // sinkTrue should run, sinkFalse should remain skipped (not run)
    expect(result.outputs["__fanout:loop"]).toEqual({
      sinkTrue: [items[0]],
      sinkFalse: [],
    });
    const sinkFalseStep = result.steps.find((s) => s.nodeId === "sinkFalse");
    expect(sinkFalseStep?.status).toBe("skipped");
  });
});
