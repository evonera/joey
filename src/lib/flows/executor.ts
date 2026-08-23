import type { FlowGraphDoc, FlowGraphEdge, FlowGraphNode, FlowStep, RunStatus } from "./types";
import { getNode } from "./registry";
import type { NodeContext, NodeExecuteResult } from "./node-contract";

// Pure graph-runner core: no DB, no network. Persistence and side effects are
// injected via ports so runs are deterministic and replay-testable.

export type ExecutorPorts = {
  onStepUpdate?: (step: FlowStep) => Promise<void> | void;
};

export type ExecuteOptions = {
  tenantId: string;
  runId: string;
  flowId: string;
  triggerPayload?: unknown;
  /** Outputs of already-completed nodes (resume / restart-from-failed). */
  cachedOutputs?: Record<string, unknown>;
  /** Approval-gate node ids pre-approved by the user (resume path). */
  approvedNodeIds?: string[];
};

export type ExecuteResult = {
  status: RunStatus;
  steps: FlowStep[];
  outputs: Record<string, unknown>;
  error?: string;
  pendingApproval?: { nodeId: string; prompt: string };
};

type Outcome = "completed" | "paused" | "failed";

const FANOUT_KEY = (loopId: string) => `__fanout:${loopId}`;

export async function executeFlow(
  doc: FlowGraphDoc,
  opts: ExecuteOptions,
  ports: ExecutorPorts = {},
): Promise<ExecuteResult> {
  const steps = new Map<string, FlowStep>();
  const outputs = new Map<string, unknown>();
  let pendingApproval: ExecuteResult["pendingApproval"] | undefined;
  /** Downstream of forEach nodes — executed per item inside fanOut only. */
  const fanoutConsumed = new Set<string>();

  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const outgoing = (id: string): FlowGraphEdge[] => doc.edges.filter((e) => e.from === id);
  const incoming = (id: string): FlowGraphEdge[] => doc.edges.filter((e) => e.to === id);

  const ctxBase: Omit<NodeContext, "nodeId"> = {
    tenantId: opts.tenantId,
    runId: opts.runId,
    flowId: opts.flowId,
    triggerPayload: opts.triggerPayload,
    approvedNodeIds: opts.approvedNodeIds,
  };

  // Seed cache as synthetic succeeded steps → resume treats them like any
  // completed node and fan-out state resets stay uniform.
  if (opts.cachedOutputs) {
    for (const [nodeId, output] of Object.entries(opts.cachedOutputs)) {
      const node = nodeById.get(nodeId);
      if (!node || steps.has(nodeId)) continue;
      steps.set(nodeId, {
        nodeId,
        type: node.type,
        status: "succeeded",
        output: stripInternal(output),
        cached: true,
      });
      outputs.set(nodeId, output);
    }
  }

  const setStatus = async (step: FlowStep) => {
    steps.set(step.nodeId, step);
    await ports.onStepUpdate?.(step);
  };

  function branchOf(id: string): string | undefined {
    const out = outputs.get(id);
    return out && typeof out === "object" && "__branch" in (out as Record<string, unknown>)
      ? ((out as Record<string, unknown>).__branch as string)
      : undefined;
  }

  /** Every incoming edge is either satisfied or explicitly branch-excluded. */
  function ready(id: string): boolean {
    for (const edge of incoming(id)) {
      const s = steps.get(edge.from);
      if (s?.status === "succeeded") continue;
      if (edge.branch && branchOf(edge.from) !== undefined && branchOf(edge.from) !== edge.branch) continue;
      return false;
    }
    return true;
  }

  /** At least one incoming edge actually carries data (entry nodes trivially yes). */
  function hasSatisfiedInput(id: string): boolean {
    const ins = incoming(id);
    if (ins.length === 0) return true;
    return ins.some((edge) => {
      const s = steps.get(edge.from);
      return s?.status === "succeeded" && !(edge.branch && branchOf(edge.from) !== undefined && branchOf(edge.from) !== edge.branch);
    });
  }

  function mergeInputs(id: string): unknown {
    const values: unknown[] = [];
    for (const edge of incoming(id)) {
      if (edge.branch && branchOf(edge.from) !== undefined && branchOf(edge.from) !== edge.branch) continue;
      const s = steps.get(edge.from);
      if (s?.status === "succeeded" && outputs.has(edge.from)) values.push(outputs.get(edge.from));
    }
    if (values.length === 0) return undefined;
    if (values.length === 1) return unwrap(values[0]);
    const mergeable = values.map(unwrap).filter(isMergeable);
    return Object.assign({}, ...mergeable);
  }

  async function skipDownstream(failedId: string) {
    const queue = outgoing(failedId).map((e) => e.to);
    const seen = new Set(queue);
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = nodeById.get(id);
      if (!node || steps.get(id)?.status) continue;
      await setStatus({ nodeId: id, type: node.type, status: "skipped" });
      for (const e of outgoing(id)) {
        if (!seen.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
    }
  }

  async function runNode(node: FlowGraphNode): Promise<"ok" | "failed" | "paused"> {
    const def = getNode(node.type);
    if (!def) {
      await setStatus({ nodeId: node.id, type: node.type, status: "failed", error: `Unknown node type ${node.type}` });
      await skipDownstream(node.id);
      return "failed";
    }

    const input = mergeInputs(node.id);
    const startedAt = new Date().toISOString();
    await setStatus({ nodeId: node.id, type: node.type, status: "working", input, startedAt });

    try {
      const config = def.configSchema.parse(node.config ?? {});
      const result = await def.execute(input, config, { ...ctxBase, nodeId: node.id });

      const stored = result.branch !== undefined ? { __branch: result.branch, value: result.output } : result.output;
      outputs.set(node.id, stored);

      if (result.waitForApproval && !opts.approvedNodeIds?.includes(node.id)) {
        pendingApproval = { nodeId: node.id, prompt: result.waitForApproval.prompt };
        await setStatus({
          nodeId: node.id,
          type: node.type,
          status: "waiting_approval",
          input,
          startedAt,
          finishedAt: new Date().toISOString(),
        });
        return "paused";
      }

      await setStatus({
        nodeId: node.id,
        type: node.type,
        status: "succeeded",
        input,
        output: stripInternal(stored),
        // Persist the routing decision so cached replay keeps it.
        ...(result.branch !== undefined ? { branch: result.branch } : {}),
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      return "ok";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await setStatus({
        nodeId: node.id,
        type: node.type,
        status: "failed",
        input,
        error: message,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      await skipDownstream(node.id);
      return "failed";
    }
  }

  /**
   * Kahn staging over the reachable subgraph. Already-done nodes (cache or a
   * previous stage) are treated as processed at setup.
   */
  async function stageLoop(entryIds: string[], consumed: Set<string> = fanoutConsumed): Promise<Outcome> {
    const reachable = reachableFrom(entryIds);

    const inDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const id of reachable) {
      inDeg.set(id, 0);
      adj.set(id, []);
    }
    for (const edge of doc.edges) {
      if (reachable.has(edge.from) && reachable.has(edge.to)) {
        adj.get(edge.from)!.push(edge.to);
        inDeg.set(edge.to, (inDeg.get(edge.to) ?? 0) + 1);
      }
    }
    // Done nodes release their edges immediately.
    const cachedFanouts: string[] = [];
    for (const id of reachable) {
      const done = steps.get(id)?.status === "succeeded";
      if (!done) continue;
      const def = getNode(nodeById.get(id)!.type);
      // A cached forEach must still drive its downstream chain per item —
      // otherwise restart-from-failed runs the chain once over the raw array.
      if (def?.forEach && outgoing(id).some((e) => !steps.get(e.to)?.status)) {
        cachedFanouts.push(id);
        continue;
      }
      for (const to of adj.get(id)!) inDeg.set(to, (inDeg.get(to) ?? 0) - 1);
    }
    let frontier: string[] = [];
    for (const id of reachable) {
      if (
        (inDeg.get(id) ?? 0) <= 0 &&
        !steps.get(id)?.status &&
        !consumed.has(id) &&
        ready(id) &&
        hasSatisfiedInput(id)
      ) {
        frontier.push(id);
      }
    }

    let branchFailed = false;

    for (const loopId of cachedFanouts) {
      for (const to of outgoing(loopId).map((e) => e.to)) fanoutConsumed.add(to);
      const items = unwrap(outputs.get(loopId));
      if (!Array.isArray(items)) continue;
      const outcome = await fanOut(loopId, items);
      if (outcome === "paused") return "paused";
      if (outcome === "failed") branchFailed = true;
    }

    while (frontier.length > 0) {
      if (pendingApproval) return "paused";

      // Failed branches must not starve independent healthy ones: on failure
      // we keep staging; skipDownstream() has already marked only the failed
      // node's descendants as skipped.
      const stage = [...frontier].filter(
        (id) => !consumed.has(id) && steps.get(id)?.status !== "skipped",
      );
      frontier = [];

      if (stage.length === 0) break;

      const results = await Promise.all(stage.map((id) => runNode(nodeById.get(id)!)));
      if (results.includes("paused")) return "paused";
      const stageFailed = results.includes("failed");
      if (stageFailed) branchFailed = true;

      // Fan-out FIRST: its downstream chain is consumed per item and must not
      // be queued into the normal frontier.
      const fanouts: string[] = [];
      for (const id of stage) {
        const def = getNode(nodeById.get(id)!.type);
        if (!def?.forEach) continue;
        const items = unwrap(outputs.get(id));
        if (!Array.isArray(items)) continue;
        fanouts.push(id);
      }

      for (const id of stage) {
        for (const to of adj.get(id)!) {
          inDeg.set(to, (inDeg.get(to) ?? 0) - 1);
          if (
            (inDeg.get(to) ?? 0) <= 0 &&
            !steps.get(to)?.status &&
            !fanoutConsumed.has(to) &&
            ready(to) &&
            hasSatisfiedInput(to)
          ) {
            frontier.push(to);
          }
        }
      }

      for (const loopId of fanouts) {
        for (const to of outgoing(loopId).map((e) => e.to)) fanoutConsumed.add(to);
        const outcome = await fanOut(loopId, unwrap(outputs.get(loopId)) as unknown[]);
        if (outcome === "paused") return "paused";
        if (outcome === "failed") {
          branchFailed = true;
        }
      }
    }
    return branchFailed ? "failed" : "completed";
  }

  /** Re-runs the downstream chain once per item; aggregates sink outputs. */
  async function fanOut(loopId: string, items: unknown[]): Promise<Outcome> {
    const entries = outgoing(loopId).map((e) => e.to);
    const reachable = reachableFrom(entries);
    // Per-sink aggregation so parallel branches don't bleed into one another:
    // __fanout:<loopId> = Record<terminalSinkNodeId, unknown[]>
    const collected: Record<string, unknown[]> = {};
    for (const id of reachable) {
      if (!doc.edges.some((e) => e.from === id)) collected[id] = [];
    }
    for (let i = 0; i < items.length; i++) {
      // Fresh slate for the chain on every iteration. Steps from the LAST
      // iteration are intentionally kept afterwards for run inspection.
      for (const id of reachable) steps.delete(id);
      outputs.set(loopId, items[i]);

      const outcome = await stageLoop(entries, new Set());
      if (outcome !== "completed") return outcome;
      for (const sinkId of Object.keys(collected)) {
        if (steps.get(sinkId)?.status !== "succeeded") continue;
        const value = unwrap(outputs.get(sinkId));
        if (Array.isArray(value)) collected[sinkId].push(...value);
        else collected[sinkId].push(value);
      }
    }

    outputs.set(FANOUT_KEY(loopId), collected);
    return "completed";
  }

  function reachableFrom(startIds: string[]): Set<string> {
    const seen = new Set<string>();
    const queue = [...startIds];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const e of outgoing(id)) queue.push(e.to);
    }
    return seen;
  }

  try {
    const triggers = doc.nodes.filter((n) => getNode(n.type)?.isTrigger);
    if (triggers.length === 0) {
      return { status: "failed", steps: [], outputs: {}, error: "Flow has no start trigger." };
    }

    const outcome = await stageLoop(triggers.map((t) => t.id));

    // Branch-not-taken paths end with no status — normalize to skipped.
    for (const node of doc.nodes) {
      if (!steps.get(node.id)?.status) {
        await setStatus({ nodeId: node.id, type: node.type, status: "skipped" });
      }
    }

    if (outcome === "paused" && pendingApproval) {
      return {
        status: "waiting_approval",
        steps: serialize(),
        outputs: toObject(outputs),
        pendingApproval,
      };
    }

    const failedStep = [...steps.values()].find((s) => s.status === "failed");
    if (outcome === "failed") {
      return {
        status: "failed",
        steps: serialize(),
        outputs: toObject(outputs),
        error: failedStep ? `${labelOf(failedStep.nodeId)}: ${failedStep.error}` : "One or more nodes failed.",
      };
    }

    return { status: "succeeded", steps: serialize(), outputs: toObject(outputs) };
  } catch (error) {
    return {
      status: "failed",
      steps: serialize(),
      outputs: toObject(outputs),
      error: error instanceof Error ? error.message : String(error),
    };
  }

  function labelOf(nodeId: string): string {
    const node = nodeById.get(nodeId);
    return node ? getNode(node.type)?.label ?? node.type : nodeId;
  }

  function serialize(): FlowStep[] {
    return [...steps.values()].map((s) =>
      s.cached ? s : { ...s, ...(s.output !== undefined ? { output: stripInternal(s.output) } : {}) },
    );
  }
}

export class NodeExecutionError extends Error {
  constructor(public nodeId: string, message: string) {
    super(message);
  }
}

function stripInternal(value: unknown): unknown {
  if (value && typeof value === "object" && "__branch" in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).value;
  }
  return value;
}

function unwrap(value: unknown): unknown {
  return stripInternal(value);
}

function isMergeable(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toObject(map: Map<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(map);
}
