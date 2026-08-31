import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { flows, flowRuns } from "@/lib/db/schema";
import type { FlowStep, RunStatus } from "./types";
import { executeAdmittedFlowRun } from "./run-flow-server";

export async function resumeFlowRunInternal(tenantId: string, runId: string, approve: boolean): Promise<{ ok?: boolean; status?: RunStatus; error?: string }> {
  const run = await db.query.flowRuns.findFirst({ where: and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId)) });
  if (!run) return { error: "Run not found" };
  const flow = await db.query.flows.findFirst({ where: and(eq(flows.id, run.flowId), eq(flows.tenantId, tenantId)) });
  if (!flow) return { error: "Flow not found" };
  if (!approve) {
    const steps = ((run.steps as FlowStep[]) ?? []).map((step) => step.status === "waiting_approval" ? { ...step, status: "failed" as const } : step.status === "working" || step.status === "ready" ? { ...step, status: "skipped" as const } : step);
    const claimed = await db.update(flowRuns).set({ status: "failed", steps, error: "Rejected at approval gate.", finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "waiting_approval"))).returning({ id: flowRuns.id });
    return claimed.length ? { ok: true, status: "failed" } : { error: "Run is not waiting for approval (already resumed)." };
  }
  const pending = (run.steps as FlowStep[]).find((step) => step.status === "waiting_approval");
  const approvedNodeIds = [...new Set([...((run.approvedNodeIds as string[]) ?? []), ...(pending ? [pending.nodeId] : [])])];
  const cachedSteps = ((run.steps as FlowStep[]) ?? []).filter((step) => step.status !== "waiting_approval");
  try {
    const claimed = await db.update(flowRuns).set({ approvedNodeIds, steps: cachedSteps, status: "running", error: null, updatedAt: new Date() }).where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "waiting_approval"))).returning({ id: flowRuns.id });
    if (!claimed.length) return { error: "Run is not waiting for approval (already resumed)." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if ((error as { code?: string }).code === "23505" || message.includes("unique")) return { error: "A newer run owns this flow; approval remains pending." };
    throw error;
  }
  const result = await executeAdmittedFlowRun({ flow, runId, triggerPayload: run.triggerPayload ?? undefined, cachedSteps, fanoutProgress: (run.fanoutProgress as Record<string, Record<string, unknown>>) ?? {}, approvedNodeIds });
  return result.persisted ? { ok: true, status: result.status } : { error: `Run finished as ${result.status}, but terminal state was not persisted.` };
}
