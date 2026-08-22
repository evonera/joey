'use server';

import { db } from "@/lib/db";
import { flows, flowRuns, flowTemplates, drafts } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import crypto from "crypto";
import { getActiveTenantId } from "@/lib/auth";
import { parseGraphDoc, validateGraph, type ValidationIssue } from "@/lib/flows/validation";
import { executeFlow } from "@/lib/flows/executor";
import type { FlowStep, RunStatus } from "@/lib/flows/types";
import { getNode } from "@/lib/flows/registry";

export type FlowRow = typeof flows.$inferSelect;
export type FlowRunRow = typeof flowRuns.$inferSelect;

export async function listFlows(): Promise<{ flows: FlowRow[] }> {
  const tenantId = await getActiveTenantId();
  const rows = await db.query.flows.findMany({
    where: eq(flows.tenantId, tenantId),
    orderBy: [desc(flows.updatedAt)],
  });
  return { flows: rows };
}

export async function createFlow(name: string): Promise<{ flow?: FlowRow; error?: string }> {
  const tenantId = await getActiveTenantId();
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) return { error: "Name is required (max 120 chars)." };

  const [flow] = await db
    .insert(flows)
    .values({
      tenantId,
      name: trimmed,
      graph: { nodes: [], edges: [] },
    })
    .returning();
  return { flow };
}

export async function getFlow(id: string): Promise<{ flow?: FlowRow; runs?: FlowRunRow[]; error?: string }> {
  const tenantId = await getActiveTenantId();
  const flow = await db.query.flows.findFirst({
    where: and(eq(flows.id, id), eq(flows.tenantId, tenantId)),
  });
  if (!flow) return { error: "Flow not found" };

  // Provision a webhook secret lazily so every flow has a stable URL.
  if (!flow.webhookSecret) {
    const secret = `wf_${crypto.randomUUID().replace(/-/g, "")}`;
    await db.update(flows).set({ webhookSecret: secret }).where(eq(flows.id, id));
    flow.webhookSecret = secret;
  }

  const runs = await db.query.flowRuns.findMany({
    where: and(eq(flowRuns.flowId, id), eq(flowRuns.tenantId, tenantId)),
    orderBy: [desc(flowRuns.startedAt)],
    limit: 20,
  });
  return { flow, runs };
}

export async function validateFlowGraph(raw: unknown): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  try {
    const doc = parseGraphDoc(raw);
    return validateGraph(doc);
  } catch (error) {
    return {
      ok: false,
      issues: [{ message: error instanceof Error ? error.message : "Invalid graph document", severity: "error" }],
    };
  }
}

export async function saveFlow(
  id: string,
  data: { name?: string; description?: string | null; graph?: unknown },
): Promise<{ ok?: boolean; issues?: ValidationIssue[]; error?: string }> {
  const tenantId = await getActiveTenantId();
  const existing = await db.query.flows.findFirst({
    where: and(eq(flows.id, id), eq(flows.tenantId, tenantId)),
  });
  if (!existing) return { error: "Flow not found" };

  if (data.graph !== undefined) {
    const result = await validateFlowGraph(data.graph);
    if (!result.ok) return { issues: result.issues };
  }

  await db
    .update(flows)
    .set({
      ...(data.name !== undefined ? { name: data.name.trim().slice(0, 120) || existing.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.graph !== undefined ? { graph: data.graph } : {}),
      updatedAt: new Date(),
    })
    .where(eq(flows.id, id));

  return { ok: true };
}

export async function setFlowStatus(
  id: string,
  status: "draft" | "active" | "paused",
): Promise<{ ok?: boolean; issues?: ValidationIssue[]; error?: string }> {
  const tenantId = await getActiveTenantId();
  const existing = await db.query.flows.findFirst({
    where: and(eq(flows.id, id), eq(flows.tenantId, tenantId)),
  });
  if (!existing) return { error: "Flow not found" };

  if (status === "active") {
    const result = await validateFlowGraph(existing.graph);
    if (!result.ok) return { issues: result.issues };
  }

  await db.update(flows).set({ status, updatedAt: new Date() }).where(eq(flows.id, id));
  return { ok: true };
}

export async function runFlow(
  id: string,
  triggerPayload?: unknown,
): Promise<{ runId?: string; error?: string }> {
  const tenantId = await getActiveTenantId();
  const flow = await db.query.flows.findFirst({
    where: and(eq(flows.id, id), eq(flows.tenantId, tenantId)),
  });
  if (!flow) return { error: "Flow not found" };

  return executeRunWithPorts({
    flow,
    tenantId,
    trigger: "manual",
    triggerPayload,
  });
}

async function executeRunWithPorts(opts: {
  flow: FlowRow;
  tenantId: string;
  trigger: "manual" | "schedule" | "webhook";
  triggerPayload?: unknown;
  cachedOutputs?: Record<string, unknown>;
  approvedNodeIds?: string[];
}): Promise<{ runId: string; status: RunStatus }> {
  const { startFlowRun } = await import("@/lib/flows/run-flow-server");
  return startFlowRun({
    flow: opts.flow,
    trigger: opts.trigger,
    triggerPayload: opts.triggerPayload,
    cachedOutputs: opts.cachedOutputs,
    approvedNodeIds: opts.approvedNodeIds,
  });
}

export async function resumeRun(
  runId: string,
  approve: boolean,
): Promise<{ ok?: boolean; status?: RunStatus; error?: string }> {
  const tenantId = await getActiveTenantId();
  const { persistStep } = await import("@/lib/flows/run-flow-server");
  const run = await db.query.flowRuns.findFirst({
    where: and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId)),
  });
  if (!run) return { error: "Run not found" };
  if (run.status !== "waiting_approval") return { error: "Run is not waiting for approval." };

  const flow = await db.query.flows.findFirst({
    where: eq(flows.id, run.flowId),
  });
  if (!flow) return { error: "Flow not found" };

  if (!approve) {
    const steps = (run.steps as FlowStep[]) ?? [];
    for (const step of steps) {
      if (step.status === "waiting_approval") step.status = "failed";
      else if (step.status === "working" || step.status === "ready") step.status = "skipped";
    }
    await db
      .update(flowRuns)
      .set({ status: "failed", steps, error: "Rejected at approval gate.", finishedAt: new Date() })
      .where(eq(flowRuns.id, runId));
    return { ok: true, status: "failed" };
  }

  const pending = (run.steps as FlowStep[]).find((s) => s.status === "waiting_approval");
  const approvedNodeIds = [...((run.approvedNodeIds as string[]) ?? []), ...(pending ? [pending.nodeId] : [])];

  const cachedOutputs: Record<string, unknown> = {};
  for (const step of run.steps as FlowStep[]) {
    if (step.status === "succeeded") cachedOutputs[step.nodeId] = step.output;
  }

  // Clear the gate's stale waiting step so it re-executes as approved.
  const clearedSteps = ((run.steps as FlowStep[]) ?? []).filter((s) => s.status !== "waiting_approval");

  await db
    .update(flowRuns)
    .set({ approvedNodeIds, steps: clearedSteps, status: "running", error: null })
    .where(eq(flowRuns.id, runId));

  const result = await executeFlow(
    flow.graph as Parameters<typeof executeFlow>[0],
    {
      tenantId,
      runId,
      flowId: flow.id,
      triggerPayload: run.triggerPayload ?? undefined,
      cachedOutputs,
      approvedNodeIds,
    },
    { onStepUpdate: (step) => persistStep(tenantId, runId, step) },
  );

  await db
    .update(flowRuns)
    .set({ status: result.status, steps: result.steps, error: result.error ?? null, finishedAt: new Date() })
    .where(eq(flowRuns.id, runId));

  return { ok: true, status: result.status };
}

/** Re-runs a failed/finished run reusing succeeded node outputs. */
export async function restartRun(runId: string): Promise<{ runId?: string; error?: string }> {
  const tenantId = await getActiveTenantId();
  const run = await db.query.flowRuns.findFirst({
    where: and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId)),
  });
  if (!run) return { error: "Run not found" };
  const flow = await db.query.flows.findFirst({ where: eq(flows.id, run.flowId) });
  if (!flow) return { error: "Flow not found" };

  const cachedOutputs: Record<string, unknown> = {};
  for (const step of run.steps as FlowStep[]) {
    if (step.status === "succeeded") cachedOutputs[step.nodeId] = step.output;
  }

  const result = await executeRunWithPorts({
    flow,
    tenantId,
    trigger: run.trigger as "manual",
    triggerPayload: run.triggerPayload ?? undefined,
    cachedOutputs,
    approvedNodeIds: (run.approvedNodeIds as string[]) ?? [],
  });
  return { runId: result.runId };
}

export async function listRuns(flowId: string): Promise<{ runs: FlowRunRow[] }> {
  const tenantId = await getActiveTenantId();
  const runs = await db.query.flowRuns.findMany({
    where: and(eq(flowRuns.flowId, flowId), eq(flowRuns.tenantId, tenantId)),
    orderBy: [desc(flowRuns.startedAt)],
    limit: 30,
  });
  return { runs };
}

// ---------------------------------------------------------------------------
// Templates / marketplace (Phase 3.5/3.6 via the Flow Builder)
// ---------------------------------------------------------------------------

export async function publishTemplate(
  flowId: string,
  meta: { name: string; description?: string; category?: string },
): Promise<{ slug?: string; error?: string }> {
  const tenantId = await getActiveTenantId();
  const flow = await db.query.flows.findFirst({
    where: and(eq(flows.id, flowId), eq(flows.tenantId, tenantId)),
  });
  if (!flow) return { error: "Flow not found" };

  const name = meta.name.trim();
  if (!name || name.length > 120) return { error: "Template name is required." };

  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "template";
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

  await db.insert(flowTemplates).values({
    slug,
    name,
    description: meta.description?.trim() || flow.description || undefined,
    category: meta.category?.trim() || "general",
    graph: flow.graph,
    authorTenantId: tenantId,
  });

  return { slug };
}

export type TemplateCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  isOfficial: boolean;
  installs: number;
};

export async function listTemplates(): Promise<{ templates: TemplateCard[] }> {
  await ensureOfficialTemplates();
  const rows = await db.query.flowTemplates.findMany({
    orderBy: [desc(flowTemplates.installs), desc(flowTemplates.createdAt)],
    columns: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      isOfficial: true,
      installs: true,
    },
  });
  return { templates: rows };
}

export async function installTemplate(templateId: string): Promise<{ flowId?: string; error?: string }> {
  const tenantId = await getActiveTenantId();
  const template = await db.query.flowTemplates.findFirst({
    where: eq(flowTemplates.id, templateId),
  });
  if (!template) return { error: "Template not found" };

  const validation = await validateFlowGraph(template.graph);
  if (!validation.ok) return { error: "Template graph is invalid." };

  const [flow] = await db
    .insert(flows)
    .values({
      tenantId,
      name: template.name,
      description: template.description,
      graph: template.graph,
      status: "draft",
    })
    .returning();

  await db
    .update(flowTemplates)
    .set({ installs: template.installs + 1 })
    .where(eq(flowTemplates.id, templateId));

  return { flowId: flow.id };
}

export async function deleteFlow(id: string): Promise<{ ok?: boolean; error?: string }> {
  const tenantId = await getActiveTenantId();
  const deleted = await db
    .delete(flows)
    .where(and(eq(flows.id, id), eq(flows.tenantId, tenantId)))
    .returning();
  if (deleted.length === 0) return { error: "Flow not found" };
  return { ok: true };
}

export async function regenerateWebhookSecret(
  id: string,
): Promise<{ secret?: string; error?: string }> {
  const tenantId = await getActiveTenantId();
  const secret = `wf_${crypto.randomUUID().replace(/-/g, "")}`;
  const updated = await db
    .update(flows)
    .set({ webhookSecret: secret })
    .where(and(eq(flows.id, id), eq(flows.tenantId, tenantId)))
    .returning({ id: flows.id });
  if (updated.length === 0) return { error: "Flow not found" };
  return { secret };
}

/**
 * Seeds the built-in official templates once. Safe to call repeatedly.
 */
async function ensureOfficialTemplates(): Promise<void> {
  const { officialTemplates } = await import("@/lib/flows/templates");
  for (const t of officialTemplates) {
    await db
      .insert(flowTemplates)
      .values({
        slug: t.slug,
        name: t.name,
        description: t.description,
        category: t.category,
        graph: t.graph,
        isOfficial: true,
      })
      .onConflictDoNothing({ target: flowTemplates.slug });
  }
}
