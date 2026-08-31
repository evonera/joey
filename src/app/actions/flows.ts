'use server';

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { flows, flowRuns, flowTemplates, drafts } from "@/lib/db/schema";
import { and, eq, desc, inArray, isNull, sql } from "drizzle-orm";
import { getActiveTenantId } from "@/lib/auth";
import { parseGraphDoc, validateGraph, type ValidationIssue } from "@/lib/flows/validation";
import type { FlowStep, RunStatus } from "@/lib/flows/types";
import { getNode } from "@/lib/flows/registry";
import { executeAdmittedFlowRun, startFlowRun } from "@/lib/flows/run-flow-server";
import { hashWebhookSecret } from "@/lib/flows/webhook-secret";

export type FlowRow = typeof flows.$inferSelect;
export type FlowRunRow = typeof flowRuns.$inferSelect;
export type FlowDetails = FlowRow & { webhookConfigured: boolean; webhookSecret: null };

export async function listFlows(): Promise<{ flows: FlowRow[] }> {
  const tenantId = await getActiveTenantId();
  const rows = await db.query.flows.findMany({
    where: eq(flows.tenantId, tenantId),
    orderBy: [desc(flows.updatedAt)],
  });
  // Never serialize stored secret hashes into client components.
  return { flows: rows.map((flow) => ({ ...flow, webhookSecret: null })) };
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

export async function getFlow(id: string): Promise<{ flow?: FlowDetails; runs?: FlowRunRow[]; error?: string }> {
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
  return {
    flow: { ...flow, webhookConfigured: Boolean(flow.webhookSecret), webhookSecret: null },
    runs,
  };
}

function generateWebhookSecret(): string {
  return `wf_${randomBytes(32).toString("base64url")}`;
}

/** Provisions once. A concurrent loser never receives a secret that was not persisted. */
export async function provisionFlowWebhookSecret(
  id: string,
): Promise<{ secret?: string; configured?: boolean; error?: string }> {
  const tenantId = await getActiveTenantId();
  const secret = generateWebhookSecret();
  const [updated] = await db
    .update(flows)
    .set({ webhookSecret: hashWebhookSecret(secret), updatedAt: new Date() })
    .where(and(eq(flows.id, id), eq(flows.tenantId, tenantId), isNull(flows.webhookSecret)))
    .returning({ id: flows.id });
  if (updated) return { secret, configured: true };

  const existing = await db.query.flows.findFirst({
    where: and(eq(flows.id, id), eq(flows.tenantId, tenantId)),
    columns: { webhookSecret: true },
  });
  if (!existing) return { error: "Flow not found" };
  return { configured: Boolean(existing.webhookSecret) };
}

/** Rotates atomically; the returned plaintext is never stored or returned again. */
export async function rotateFlowWebhookSecret(
  id: string,
): Promise<{ secret?: string; error?: string }> {
  const tenantId = await getActiveTenantId();
  const secret = generateWebhookSecret();
  const [updated] = await db
    .update(flows)
    .set({ webhookSecret: hashWebhookSecret(secret), updatedAt: new Date() })
    .where(and(eq(flows.id, id), eq(flows.tenantId, tenantId)))
    .returning({ id: flows.id });
  return updated ? { secret } : { error: "Flow not found" };
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
  const graphJson = data.graph === undefined ? undefined : JSON.stringify(data.graph);

  await db
    .update(flows)
    .set({
      ...(data.name !== undefined ? { name: data.name.trim().slice(0, 120) || existing.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.graph !== undefined ? { graph: data.graph } : {}),
      ...(graphJson !== undefined
        ? {
            executionRevision: sql`CASE WHEN ${flows.graph} IS DISTINCT FROM ${graphJson}::jsonb THEN ${flows.executionRevision} + 1 ELSE ${flows.executionRevision} END`,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(flows.id, id), eq(flows.tenantId, tenantId)));

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

  const [updated] = await db
    .update(flows)
    .set({
      status,
      executionRevision: sql`${flows.executionRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(flows.id, id),
      eq(flows.tenantId, tenantId),
      sql`${flows.status} <> ${status}`,
    ))
    .returning({ id: flows.id });
  if (!updated) {
    // The database observed the requested status at the write boundary, so a
    // concurrent same-target submission does not create a second revision.
    return { ok: true };
  }
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

  const result = await startFlowRun({
    flow,
    trigger: "manual",
    triggerPayload,
  });
  return { runId: result.runId, ...(result.persisted ? {} : { error: result.error }) };
}

export async function resumeRun(
  runId: string,
  approve: boolean,
): Promise<{ ok?: boolean; status?: RunStatus; error?: string }> {
  const tenantId = await getActiveTenantId();
  const { resumeFlowRunInternal } = await import("@/lib/flows/resume-flow");
  return resumeFlowRunInternal(tenantId, runId, approve);
}

/** Re-runs a failed/finished run reusing succeeded node outputs. */
export async function restartRun(runId: string): Promise<{ runId?: string; error?: string }> {
  const tenantId = await getActiveTenantId();

  // Atomically claim the original run and insert the replacement run in a single transaction
  let newRunId: string;
  let flow: FlowRow;
  let cachedSteps: FlowStep[];
  let fanoutProgress: Record<string, Record<string, unknown>>;
  let approvedNodeIds: string[];
  let triggerPayload: unknown;

  try {
    const setup = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .select()
        .from(flowRuns)
        .where(
          and(
            eq(flowRuns.id, runId),
            eq(flowRuns.tenantId, tenantId),
            inArray(flowRuns.status, ["failed", "succeeded"]),
          ),
        )
        .for("update");

      if (!claimed) {
        return { error: "Run not found or not in a restartable state (failed or succeeded)." };
      }

      const flowRecord = await tx.query.flows.findFirst({ where: eq(flows.id, claimed.flowId) });
      if (!flowRecord) {
        return { error: "Flow not found" };
      }

      // Mark original run as restarted
      await tx
        .update(flowRuns)
        .set({ status: "restarted", updatedAt: new Date() })
        .where(eq(flowRuns.id, runId));

      // Insert the replacement run row atomically
      const [insertedRun] = await tx
        .insert(flowRuns)
        .values({
          flowId: flowRecord.id,
          tenantId,
          trigger: claimed.trigger,
          triggerPayload: claimed.triggerPayload ?? null,
          approvedNodeIds: (claimed.approvedNodeIds as string[]) ?? [],
        })
        .returning();

      return {
        flow: flowRecord,
        newRunId: insertedRun.id,
        cachedSteps: (claimed.steps as FlowStep[]) ?? [],
        fanoutProgress: (claimed.fanoutProgress as Record<string, Record<string, unknown>>) ?? {},
        approvedNodeIds: (claimed.approvedNodeIds as string[]) ?? [],
        triggerPayload: claimed.triggerPayload ?? undefined,
      };
    });

    if ("error" in setup) {
      return { error: setup.error };
    }

    flow = setup.flow;
    newRunId = setup.newRunId;
    cachedSteps = setup.cachedSteps;
    fanoutProgress = setup.fanoutProgress;
    approvedNodeIds = setup.approvedNodeIds;
    triggerPayload = setup.triggerPayload;
  } catch (err: any) {
    return { error: err?.message || "Failed to initialize replacement run." };
  }

  const finalResult = await executeAdmittedFlowRun({
    flow,
    runId: newRunId,
    triggerPayload,
    cachedSteps,
    fanoutProgress,
    approvedNodeIds,
  });

  if (!finalResult.persisted) {
    try {
      await db
        .update(flowRuns)
        .set({ status: "failed", error: finalResult.error || "Failed to persist terminal status.", finishedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(flowRuns.id, newRunId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
    } catch {}
    return { runId: newRunId, error: finalResult.error || "Failed to persist terminal status to database." };
  }

  return { runId: newRunId };
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
