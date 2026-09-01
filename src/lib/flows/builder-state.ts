import type { FlowGraphDoc } from "@/lib/flows/types";

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
