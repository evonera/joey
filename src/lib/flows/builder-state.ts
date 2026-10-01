import type { FlowGraphDoc } from "@/lib/flows/types";
import { getNodeMeta } from "@/lib/flows/catalog";

/** Mobile auto-append supports connected linear graphs, never implicit branches. */
export function mobileAppendSource(graph: FlowGraphDoc): { ok: boolean; sourceId?: string } {
  if (!graph.nodes.length) return { ok: graph.edges.length === 0 };
  // Multiple data handles (Exa results/images) do not imply control-flow branches.
  const branchingTypes = new Set(["logic.condition", "logic.split", "ai.decision"]);
  if (graph.nodes.some(node => !getNodeMeta(node.type) || branchingTypes.has(node.type)) || graph.edges.some(edge => edge.branch)) return { ok: false };
  if (graph.edges.length !== graph.nodes.length - 1) return { ok: false };
  const ids = new Set(graph.nodes.map(node => node.id));
  const outgoing = new Map<string, string>();
  const incoming = new Set<string>();
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || outgoing.has(edge.from) || incoming.has(edge.to)) return { ok: false };
    outgoing.set(edge.from, edge.to);
    incoming.add(edge.to);
  }
  const roots = graph.nodes.filter(node => !incoming.has(node.id));
  if (roots.length !== 1) return { ok: false };
  const visited = new Set<string>();
  let cursor = roots[0].id;
  while (outgoing.has(cursor)) {
    if (visited.has(cursor)) return { ok: false };
    visited.add(cursor);
    cursor = outgoing.get(cursor)!;
  }
  return { ok: visited.size + 1 === graph.nodes.length, sourceId: cursor };
}

type BuilderNode = {
  id: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

type BuilderEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
};

export function builderStateToGraphDoc(nodes: BuilderNode[], edges: BuilderEdge[]): FlowGraphDoc {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: (node.data as { nodeType: string }).nodeType,
      config: ((node.data as { config?: Record<string, unknown> }).config ?? {}),
      position: node.position,
    })),
    edges: edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      ...(edge.sourceHandle ? { branch: edge.sourceHandle } : {}),
    })),
  };
}

export function isAgentReviewSnapshotCurrent(reviewedRevision: number, currentRevision: number): boolean {
  return reviewedRevision === currentRevision;
}
