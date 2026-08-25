import { z } from "zod";
import type { FlowGraphDoc } from "./types";
import { getNode } from "./registry";

export type ValidationIssue = { nodeId?: string; message: string; severity: "error" | "warning" };

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

const graphDocSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      type: z.string().min(1),
      config: z.record(z.string(), z.unknown()).default({}),
      position: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      branch: z.string().optional(),
    }),
  ),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number() })
    .optional(),
});

export function parseGraphDoc(raw: unknown): FlowGraphDoc {
  return graphDocSchema.parse(raw) as FlowGraphDoc;
}

export function validateGraph(doc: FlowGraphDoc): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (doc.nodes.length === 0) {
    return { ok: false, issues: [{ message: "The flow is empty.", severity: "error" }] };
  }

  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  if (nodeIds.size !== doc.nodes.length) {
    issues.push({ message: "Duplicate node ids found.", severity: "error" });
  }

  for (const node of doc.nodes) {
    const def = getNode(node.type);
    if (!def) {
      issues.push({ nodeId: node.id, message: `Unknown node type "${node.type}".`, severity: "error" });
      continue;
    }
    const parsed = def.configSchema.safeParse(node.config ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      issues.push({
        nodeId: node.id,
        message: `${def.label}: ${first ? `${first.path.join(".") || "config"} ${first.message}` : "invalid config"}`,
        severity: "error",
      });
    }
  }

  for (const edge of doc.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({
        message: `Edge references a missing node (${edge.from} → ${edge.to}).`,
        severity: "error",
      });
    }
  }
  if (issues.some((i) => i.severity === "error")) {
    return { ok: false, issues };
  }

  // Cycle detection via Kahn's algorithm — leftover nodes are on a cycle.
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }
  for (const e of doc.edges) {
    adjacency.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }
  let queue = [...nodeIds].filter((id) => (inDegree.get(id) ?? 0) === 0);
  let visited = 0;
  while (queue.length > 0) {
    const next: string[] = [];
    for (const id of queue) {
      visited += 1;
      for (const to of adjacency.get(id) ?? []) {
        const d = (inDegree.get(to) ?? 0) - 1;
        inDegree.set(to, d);
        if (d === 0) next.push(to);
      }
    }
    queue = next;
  }
  if (visited < nodeIds.size) {
    const cyclic = [...nodeIds].filter((id) => (inDegree.get(id) ?? 0) > 0);
    for (const id of cyclic.slice(0, 5)) {
      const node = doc.nodes.find((n) => n.id === id);
      const label = getNode(node?.type ?? "")?.label ?? node?.type;
      issues.push({ nodeId: id, message: `"${label}" is part of a loop — flows can't cycle.`, severity: "error" });
    }
    return { ok: false, issues };
  }

  // Exactly one trigger must exist and it should have no incoming edges.
  const triggers = doc.nodes.filter((n) => getNode(n.type)?.isTrigger);
  if (triggers.length === 0) {
    issues.push({ message: "Add a start trigger (Manual or Schedule).", severity: "error" });
  }
  for (const trigger of triggers) {
    if (doc.edges.some((e) => e.to === trigger.id)) {
      issues.push({ nodeId: trigger.id, message: "A trigger cannot receive connections.", severity: "error" });
    }
  }

  // Warnings: dead ends that aren't terminal actions.
  for (const node of doc.nodes) {
    const hasOutgoing = doc.edges.some((e) => e.from === node.id);
    const def = getNode(node.type);
    if (!hasOutgoing && def && !["action", "logic"].includes(def.category)) {
      issues.push({
        nodeId: node.id,
        message: `"${def.label}" doesn't lead anywhere — add an action like Create Draft or Notify.`,
        severity: "warning",
      });
    }
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}
