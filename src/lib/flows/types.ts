// Flow Builder core types. A flow graph is a single serializable document
// (breadboard-style) that includes canvas positions so the builder restores
// the exact board.

export type FlowGraphNode = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
};

export type FlowGraphEdge = {
  from: string;
  to: string;
  /** For condition nodes: only follow downstream when the branch matches ('true'|'false'). */
  branch?: string;
};

export type FlowGraphViewport = { x: number; y: number; zoom: number };

export type FlowGraphDoc = {
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  viewport?: FlowGraphViewport;
};

export type StepStatus =
  | "ready"
  | "working"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "skipped";

export type RunStatus = "running" | "waiting_approval" | "succeeded" | "failed";

export type FlowStep = {
  nodeId: string;
  type: string;
  status: StepStatus;
  input?: unknown;
  output?: unknown;
  /** Condition nodes: which outgoing branch was taken ('true'|'false'). */
  branch?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  /** Synthetic entry restored from a previous run's cached output. */
  cached?: boolean;
};

export const TERMINAL_STEP_STATUSES: StepStatus[] = ["succeeded", "failed", "skipped"];

export function isTerminalStep(status: StepStatus): boolean {
  return TERMINAL_STEP_STATUSES.includes(status);
}
