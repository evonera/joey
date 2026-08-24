'use server';

import { db } from "@/lib/db";
import { flows, flowRuns, flowTemplates, drafts } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
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

async function persistStep(tenantId: string, runId: string, step: FlowStep) {
  const run = await db.query.flowRuns.findFirst({
    where: and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId)),
    columns: { steps: true },
  });
  if (!run) return;
  const steps = (run.steps as FlowStep[]) ?? [];
  const idx = steps.findIndex((s) => s.nodeId === step.nodeId);
  if (idx >= 0) steps[idx] = step;
  else steps.push(step);
  await db
    .update(flowRuns)
    .set({ steps, updatedAt: new Date() })
    .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
}

async function finalizeRun(
  runId: string,
  tenantId: string,
  outcome: { status: RunStatus; steps?: FlowStep[]; error?: string | null } | Error,
): Promise<{ persisted: boolean; status: RunStatus; error?: string }> {
  const isErr = outcome instanceof Error;
  const status: RunStatus = isErr ? "failed" : outcome.status;
  const steps = isErr ? undefined : outcome.steps;
  const error = isErr ? outcome.message : (outcome.error ?? null);
  const finishedAt = new Date();
  const updatedAt = new Date();

  // Retry up to 3 times with exponential backoff across rich and minimal writes
  for (let attempt = 0; attempt < 3; attempt++) {
    // 1. Primary write with full steps payload
    try {
      const updated = await db
        .update(flowRuns)
        .set({
          status,
          ...(steps !== undefined ? { steps } : {}),
          error,
          finishedAt,
          updatedAt,
        })
        .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")))
        .returning({ id: flowRuns.id });

      if (updated.length > 0) return { persisted: true, status };
    } catch (primaryErr) {
      console.warn(`[flow-finalize] Rich finalization attempt ${attempt + 1} failed for run ${runId}:`, primaryErr);
    }

    // 2. Fallback: minimal update omitting steps payload
    try {
      const fallbackUpdated = await db
        .update(flowRuns)
        .set({
          status,
          error: error ? `${error}` : "Finalization fallback applied (steps omitted).",
          finishedAt,
          updatedAt,
        })
        .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")))
        .returning({ id: flowRuns.id });

      if (fallbackUpdated.length > 0) return { persisted: true, status };
    } catch (fallbackErr) {
      console.error(`[flow-finalize] Minimal finalization attempt ${attempt + 1} failed for run ${runId}:`, fallbackErr);
    }

    // Check if the run has already been transitioned to a terminal status by stale recovery
    try {
      const existing = await db.query.flowRuns.findFirst({
        where: and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId)),
        columns: { status: true },
      });
      if (existing && existing.status !== "running") {
        return { persisted: true, status: existing.status as RunStatus };
      }
    } catch {}

    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
    }
  }

  // All persistence attempts exhausted
  return {
    persisted: false,
    status,
    error: "Failed to persist terminal status to database after retries.",
  };
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
  cachedSteps?: FlowStep[];
  fanoutProgress?: Record<string, Record<string, unknown>>;
  approvedNodeIds?: string[];
}): Promise<{ runId: string; status: RunStatus; error?: string }> {
  let runId = "";
  const [run] = await db
    .insert(flowRuns)
    .values({
      flowId: opts.flow.id,
      tenantId: opts.tenantId,
      trigger: opts.trigger,
      triggerPayload: opts.triggerPayload ?? null,
      approvedNodeIds: opts.approvedNodeIds ?? [],
    })
    .returning();
  runId = run.id;

  let result;
  let execError: unknown;
  try {
    result = await executeFlow(
      opts.flow.graph as Parameters<typeof executeFlow>[0],
      {
        tenantId: opts.tenantId,
        runId,
        flowId: opts.flow.id,
        triggerPayload: opts.triggerPayload,
        cachedSteps: opts.cachedSteps,
        fanoutProgress: opts.fanoutProgress,
        approvedNodeIds: opts.approvedNodeIds,
      },
      {
        onStepUpdate: (step) => persistStep(opts.tenantId, runId, step),
        onFanoutProgress: async (progress) => {
          await db
            .update(flowRuns)
            .set({ fanoutProgress: progress, updatedAt: new Date() })
            .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, opts.tenantId), eq(flowRuns.status, "running")));
        },
        onHeartbeat: async () => {
          await db
            .update(flowRuns)
            .set({ updatedAt: new Date() })
            .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, opts.tenantId), eq(flowRuns.status, "running")));
        },
      },
    );
  } catch (err) {
    execError = err;
  }

  const finalResult = await finalizeRun(
    runId,
    opts.tenantId,
    result
      ? { status: result.status, steps: result.steps, error: result.error ?? null }
      : (execError instanceof Error ? execError : new Error(String(execError ?? "Execution crashed"))),
  );

  await db.update(flows).set({ lastRunAt: new Date(), updatedAt: new Date() }).where(eq(flows.id, opts.flow.id));

  return { runId, status: finalResult.status, error: finalResult.persisted ? undefined : finalResult.error };
}

export async function resumeRun(
  runId: string,
  approve: boolean,
): Promise<{ ok?: boolean; status?: RunStatus; error?: string }> {
  const tenantId = await getActiveTenantId();
  const run = await db.query.flowRuns.findFirst({
    where: and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId)),
  });
  if (!run) return { error: "Run not found" };

  const flow = await db.query.flows.findFirst({
    where: eq(flows.id, run.flowId),
  });
  if (!flow) return { error: "Flow not found" };

  // Atomic claim: exactly one concurrent caller can move the run out of
  // waiting_approval, so downstream side effects can never execute twice.
  if (!approve) {
    const steps = (run.steps as FlowStep[]) ?? [];
    for (const step of steps) {
      if (step.status === "waiting_approval") step.status = "failed";
      else if (step.status === "working" || step.status === "ready") step.status = "skipped";
    }
    const claimed = await db
      .update(flowRuns)
      .set({ status: "failed", steps, error: "Rejected at approval gate.", finishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "waiting_approval")))
      .returning();

    if (claimed.length === 0) {
      return { error: "Run is not waiting for approval (already resumed)." };
    }
    return { ok: true, status: "failed" };
  }

  const pending = (run.steps as FlowStep[]).find((s) => s.status === "waiting_approval");
  const approvedNodeIds = [...((run.approvedNodeIds as string[]) ?? []), ...(pending ? [pending.nodeId] : [])];

  // Full step list preserves clean branch-skips and failure markers for replay.
  const clearedSteps = ((run.steps as FlowStep[]) ?? []).filter((s) => s.status !== "waiting_approval");

  const claimed = await db
    .update(flowRuns)
    .set({ approvedNodeIds, steps: clearedSteps, status: "running", error: null, updatedAt: new Date() })
    .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "waiting_approval")))
    .returning();

  if (claimed.length === 0) {
    return { error: "Run is not waiting for approval (already resumed)." };
  }

  let result;
  let execError: unknown;
  try {
    result = await executeFlow(
      flow.graph as Parameters<typeof executeFlow>[0],
      {
        tenantId,
        runId,
        flowId: flow.id,
        triggerPayload: run.triggerPayload ?? undefined,
        cachedSteps: clearedSteps,
        fanoutProgress: (run.fanoutProgress as Record<string, Record<string, unknown>>) ?? {},
        approvedNodeIds,
      },
      {
        onStepUpdate: (step) => persistStep(tenantId, runId, step),
        onFanoutProgress: async (progress) => {
          await db
            .update(flowRuns)
            .set({ fanoutProgress: progress, updatedAt: new Date() })
            .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
        },
        onHeartbeat: async () => {
          await db
            .update(flowRuns)
            .set({ updatedAt: new Date() })
            .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
        },
      },
    );
  } catch (err) {
    execError = err;
  }

  const finalResult = await finalizeRun(
    runId,
    tenantId,
    result
      ? { status: result.status, steps: result.steps, error: result.error ?? null }
      : (execError instanceof Error ? execError : new Error(String(execError ?? "Resumed execution crashed"))),
  );

  if (!finalResult.persisted) {
    // Revert status back to 'waiting_approval' so the run is never stranded
    // in an un-resumable 'running' state if terminal persistence failed.
    try {
      await db
        .update(flowRuns)
        .set({
          status: "waiting_approval",
          error: "Failed to persist execution outcome. You can retry approval resume.",
          updatedAt: new Date(),
        })
        .where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
    } catch (revertErr) {
      console.error(`[flow-resume] Failed reverting run ${runId} to waiting_approval:`, revertErr);
    }

    return {
      ok: false,
      status: finalResult.status,
      error: `Run execution finished with status '${finalResult.status}', but terminal state could not be persisted to the database. The run has been restored to waiting_approval so you can retry.`,
    };
  }

  return { ok: true, status: finalResult.status };
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

  const result = await executeRunWithPorts({
    flow,
    tenantId,
    trigger: run.trigger as "manual",
    triggerPayload: run.triggerPayload ?? undefined,
    cachedSteps: (run.steps as FlowStep[]) ?? [],
    fanoutProgress: (run.fanoutProgress as Record<string, Record<string, unknown>>) ?? {},
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
