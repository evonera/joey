import type { z } from "zod";

export type NodeCategory = "trigger" | "data" | "transform" | "ai" | "action" | "logic";

export type NodeContext = {
  tenantId: string;
  runId: string;
  flowId: string;
  nodeId: string;
  triggerPayload?: unknown;
  /** Approval-gate node ids already approved for this run (resume path). */
  approvedNodeIds?: string[];
  signal?: AbortSignal;
};

export type NodeExecuteResult = {
  /** Data passed to downstream nodes. */
  output?: unknown;
  /** For condition nodes: which outgoing branch matched ('true' | 'false'). */
  branch?: string;
  /** Approval gate: pause the run until the user resolves it. */
  waitForApproval?: { prompt: string };
};

export type NodeDefinition = {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  inputs: string[];
  outputs: string[];
  isTrigger?: boolean;
  /** Executor fans out: downstream runs once per item of the array output. */
  forEach?: boolean;
  configSchema: z.ZodTypeAny;
  execute(input: unknown, config: unknown, ctx: NodeContext): Promise<NodeExecuteResult>;
};

/**
 * Declares a flow node. Keeps `type` literal (so registry keys can be
 * compile-time checked against it) and types `execute`'s config from the
 * zod schema.
 */
export function defineNode<S extends z.ZodTypeAny, TType extends string>(def: {
  type: TType;
  category: NodeCategory;
  label: string;
  description: string;
  inputs: string[];
  outputs: string[];
  isTrigger?: boolean;
  forEach?: boolean;
  configSchema: S;
  execute(input: unknown, config: z.infer<S>, ctx: NodeContext): Promise<NodeExecuteResult>;
}): NodeDefinition & { type: TType } {
  return def as NodeDefinition & { type: TType };
}
