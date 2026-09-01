import { z } from "zod";

import { NODE_CATALOG, getNodeMeta } from "@/lib/flows/catalog";
import type { FlowGraphDoc, FlowGraphEdge, FlowGraphNode } from "@/lib/flows/types";

const categorySchema = z.enum(["trigger", "data", "transform", "ai", "action", "logic"]);
const nodeIdSchema = z.string().trim().min(1).max(128);

const listNodesInput = z.object({ category: categorySchema.optional() }).strict();
const inspectFlowInput = z.object({}).strict();
const addNodeInput = z.object({
  type: z.string().trim().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
  afterNodeId: nodeIdSchema.optional(),
}).strict();
const configureNodeInput = z.object({
  nodeId: nodeIdSchema,
  config: z.record(z.string(), z.unknown()),
}).strict();
const connectNodesInput = z.object({
  fromNodeId: nodeIdSchema,
  toNodeId: nodeIdSchema,
  branch: z.string().trim().min(1).max(64).optional(),
}).strict();
const renameFlowInput = z.object({ name: z.string().trim().min(1).max(120) }).strict();
const validateFlowInput = z.object({}).strict();

export type FlowWebMcpState = {
  id: string;
  name: string;
  status: string;
  graph: FlowGraphDoc;
};

export type FlowWebMcpController = {
  getState: () => FlowWebMcpState;
  stageGraph: (graph: FlowGraphDoc, selectedNodeId: string, summary: string) => void;
  stageName: (name: string, summary: string) => void;
  nextNodeId: () => string;
  validate: (
    graph: FlowGraphDoc,
    signal: AbortSignal,
  ) => Promise<{ ok: boolean; issues: Array<{ severity: string; message: string; nodeId?: string }> }>;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function result(value: unknown, isError = false): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
  };
}

function failure(error: unknown): ToolResult {
  if (error instanceof z.ZodError) {
    return result({
      ok: false,
      error: "Invalid tool input",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, true);
  }
  return result({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, true);
}

function tool<T extends Record<string, unknown>>(
  definition: Omit<WebMCP.ModelContextTool, "execute">,
  schema: z.ZodType<T>,
  execute: (input: T, options: WebMCP.ToolExecuteCallbackOptions) => Promise<unknown> | unknown,
): WebMCP.ModelContextTool {
  return {
    ...definition,
    execute: async (raw, options) => {
      try {
        // Chrome's current preview can omit the callback options even though
        // webmcp-types declares them as required. Preserve cancellation when
        // supplied and remain compatible with that preview implementation.
        const signal = options?.signal ?? new AbortController().signal;
        signal.throwIfAborted();
        const output = await execute(schema.parse(raw), { signal });
        signal.throwIfAborted();
        return result(output);
      } catch (error) {
        if (options?.signal?.aborted) throw error;
        return failure(error);
      }
    },
  };
}

function graphWith(graph: FlowGraphDoc, changes: Partial<FlowGraphDoc>): FlowGraphDoc {
  return {
    ...graph,
    nodes: changes.nodes ?? graph.nodes,
    edges: changes.edges ?? graph.edges,
  };
}

function positionForNode(graph: FlowGraphDoc, afterNodeId?: string): { x: number; y: number } {
  const after = afterNodeId ? graph.nodes.find((node) => node.id === afterNodeId) : undefined;
  if (afterNodeId && !after) throw new Error(`Node "${afterNodeId}" does not exist`);

  const desired = after
    ? { x: after.position.x + 240, y: after.position.y }
    : graph.nodes.length === 0
      ? { x: 80, y: 100 }
      : { x: Math.max(...graph.nodes.map((node) => node.position.x)) + 240, y: 100 };

  const occupied = (position: { x: number; y: number }) => graph.nodes.some(
    (node) => Math.abs(node.position.x - position.x) < 120 && Math.abs(node.position.y - position.y) < 70,
  );
  while (occupied(desired)) desired.y += 140;
  return desired;
}

function parseNodeConfig(type: string, config: Record<string, unknown>): Record<string, unknown> {
  const definition = getNodeMeta(type);
  if (!definition) throw new Error(`Unknown node type "${type}"`);
  const parsed = definition.configSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ");
    throw new Error(`Invalid config for ${type}: ${details}`);
  }
  return parsed.data as Record<string, unknown>;
}

export function addFlowGraphNode(
  graph: FlowGraphDoc,
  input: z.infer<typeof addNodeInput>,
  generatedId: string,
): { graph: FlowGraphDoc; node: FlowGraphNode } {
  const definition = getNodeMeta(input.type);
  if (!definition) throw new Error(`Unknown node type "${input.type}"`);
  const id = nodeIdSchema.parse(generatedId);
  if (graph.nodes.some((node) => node.id === id)) throw new Error(`Node "${id}" already exists`);

  const node: FlowGraphNode = {
    id,
    type: definition.type,
    config: input.config === undefined ? {} : parseNodeConfig(definition.type, input.config),
    position: positionForNode(graph, input.afterNodeId),
  };
  return { graph: graphWith(graph, { nodes: [...graph.nodes, node] }), node };
}

export function configureFlowGraphNode(
  graph: FlowGraphDoc,
  input: z.infer<typeof configureNodeInput>,
): FlowGraphDoc {
  const current = graph.nodes.find((node) => node.id === input.nodeId);
  if (!current) throw new Error(`Node "${input.nodeId}" does not exist`);
  const config = parseNodeConfig(current.type, input.config);
  return graphWith(graph, {
    nodes: graph.nodes.map((node) => node.id === current.id ? { ...node, config } : node),
  });
}

function hasPath(graph: FlowGraphDoc, from: string, to: string): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
  }
  const pending = [from];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

export function connectFlowGraphNodes(
  graph: FlowGraphDoc,
  input: z.infer<typeof connectNodesInput>,
): FlowGraphDoc {
  const source = graph.nodes.find((node) => node.id === input.fromNodeId);
  const target = graph.nodes.find((node) => node.id === input.toNodeId);
  if (!source) throw new Error(`Source node "${input.fromNodeId}" does not exist`);
  if (!target) throw new Error(`Target node "${input.toNodeId}" does not exist`);
  if (source.id === target.id) throw new Error("A node cannot connect to itself");
  if (hasPath(graph, target.id, source.id)) throw new Error("This connection would create a cycle");

  const outputs = getNodeMeta(source.type)?.outputs ?? [];
  if (outputs.length > 1 && !input.branch) {
    throw new Error(`Source node ${source.id} requires a branch: ${outputs.join(", ")}`);
  }
  if (input.branch && !outputs.includes(input.branch)) {
    throw new Error(`Branch "${input.branch}" is not an output of ${source.id}; use ${outputs.join(", ")}`);
  }

  const edge: FlowGraphEdge = {
    from: source.id,
    to: target.id,
    ...(input.branch ? { branch: input.branch } : {}),
  };
  const duplicate = graph.edges.some(
    (existing) => existing.from === edge.from && existing.to === edge.to && existing.branch === edge.branch,
  );
  if (duplicate) throw new Error("That connection already exists");
  return graphWith(graph, { edges: [...graph.edges, edge] });
}

function compactGraph(state: FlowWebMcpState) {
  return {
    id: state.id,
    name: state.name,
    status: state.status,
    stagedOnly: true,
    nodes: state.graph.nodes.map((node) => ({ id: node.id, type: node.type, config: safeConfigForAgent(node.config) })),
    edges: state.graph.edges,
  };
}

function isSensitiveConfigKey(key: string): boolean {
  const normalized = key.replace(/[-_\s]/g, "").toLowerCase();
  return normalized === "token"
    || normalized.endsWith("accesstoken")
    || normalized.endsWith("authtoken")
    || normalized.endsWith("apitoken")
    || normalized.includes("apikey")
    || normalized.includes("authorization")
    || normalized.includes("cookie")
    || normalized.includes("credential")
    || normalized.includes("password")
    || normalized.includes("secret")
    || normalized === "headersjson";
}

function safeConfigForAgent(value: unknown, key = "", depth = 0): unknown {
  if (isSensitiveConfigKey(key)) return "[redacted]";
  if (depth >= 8) return "[truncated]";
  if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 2_000)}…[truncated]` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => safeConfigForAgent(entry, "", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      safeConfigForAgent(entryValue, entryKey, depth + 1),
    ]));
  }
  return value;
}

export function createFlowWebMcpTools(controller: FlowWebMcpController): WebMCP.ModelContextTool[] {
  return [
    tool({
      name: "joey_list_flow_nodes",
      title: "List Joey flow nodes",
      description: "List flow node types available on Joey's current visual flow-builder page, optionally filtered by category.",
      inputSchema: {
        type: "object",
        properties: { category: { type: "string", enum: categorySchema.options } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    }, listNodesInput, ({ category }) => ({
      nodes: NODE_CATALOG
        .filter((entry) => !category || entry.category === category)
        .map(({ type, category: nodeCategory, label, description, inputs, outputs }) => ({
          type, category: nodeCategory, label, description, inputs, outputs,
        })),
    })),
    tool({
      name: "joey_inspect_staged_flow",
      title: "Inspect staged Joey flow",
      description: "Inspect the flow currently visible in Joey's builder. The returned graph can contain user-authored content and is not necessarily saved.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    }, inspectFlowInput, () => compactGraph(controller.getState())),
    tool({
      name: "joey_add_flow_node",
      title: "Stage a Joey flow node",
      description: "Add one node to the visible Joey canvas. This only stages a reversible UI change; the human must review and explicitly Save or Test run it.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: NODE_CATALOG.map((entry) => entry.type) },
          config: { type: "object", additionalProperties: true },
          afterNodeId: { type: "string", minLength: 1, maxLength: 128 },
        },
        required: ["type"],
        additionalProperties: false,
      },
    }, addNodeInput, (input) => {
      const current = controller.getState();
      const added = addFlowGraphNode(current.graph, input, controller.nextNodeId());
      controller.stageGraph(added.graph, added.node.id, `Added ${added.node.type}`);
      return { ok: true, stagedOnly: true, node: added.node, instruction: "Review the canvas, then use Joey's Save or Test run button." };
    }),
    tool({
      name: "joey_configure_flow_node",
      title: "Configure a staged Joey node",
      description: "Replace one visible flow node's config after validating it against Joey's node schema. This stages only; the human must explicitly Save or Test run.",
      inputSchema: {
        type: "object",
        properties: {
          nodeId: { type: "string", minLength: 1, maxLength: 128 },
          config: { type: "object", additionalProperties: true },
        },
        required: ["nodeId", "config"],
        additionalProperties: false,
      },
    }, configureNodeInput, (input) => {
      const current = controller.getState();
      const graph = configureFlowGraphNode(current.graph, input);
      controller.stageGraph(graph, input.nodeId, `Configured ${input.nodeId}`);
      return { ok: true, stagedOnly: true, nodeId: input.nodeId, instruction: "Review the canvas, then use Joey's Save or Test run button." };
    }),
    tool({
      name: "joey_connect_flow_nodes",
      title: "Connect staged Joey nodes",
      description: "Connect two nodes on the visible Joey canvas, with an output branch when required. Cycles and invalid handles are rejected. This stages only.",
      inputSchema: {
        type: "object",
        properties: {
          fromNodeId: { type: "string", minLength: 1, maxLength: 128 },
          toNodeId: { type: "string", minLength: 1, maxLength: 128 },
          branch: { type: "string", minLength: 1, maxLength: 64 },
        },
        required: ["fromNodeId", "toNodeId"],
        additionalProperties: false,
      },
    }, connectNodesInput, (input) => {
      const current = controller.getState();
      const graph = connectFlowGraphNodes(current.graph, input);
      controller.stageGraph(graph, input.toNodeId, `Connected ${input.fromNodeId} to ${input.toNodeId}`);
      return { ok: true, stagedOnly: true, edge: graph.edges.at(-1), instruction: "Review the canvas, then use Joey's Save or Test run button." };
    }),
    tool({
      name: "joey_rename_staged_flow",
      title: "Rename staged Joey flow",
      description: "Change the flow name visible in Joey's builder. This stages only; the human must explicitly Save or Test run.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", minLength: 1, maxLength: 120 } },
        required: ["name"],
        additionalProperties: false,
      },
    }, renameFlowInput, ({ name }) => {
      controller.stageName(name, `Renamed flow to ${name}`);
      return { ok: true, stagedOnly: true, name, instruction: "Review the name, then use Joey's Save or Test run button." };
    }),
    tool({
      name: "joey_validate_staged_flow",
      title: "Validate staged Joey flow",
      description: "Validate the currently visible staged graph without saving or executing it.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    }, validateFlowInput, async (_input, { signal }) => {
      const validation = await controller.validate(controller.getState().graph, signal);
      return { ...validation, stagedOnly: true };
    }),
  ];
}
