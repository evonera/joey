import { db } from "@/lib/db";
import { flows, flowRuns } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { executeFlow } from "./executor";
import type { FlowStep, RunStatus } from "./types";
import type { FlowRow } from "@/app/actions/flows";

type MinimalFlow = {
  id: string;
  tenantId: string;
  graph: unknown;
};

/**
 * Creates a run row, executes the flow with step persistence, and finalizes
 * the row. Single source of truth for every trigger path (manual action,
 * schedule tick, Zernio webhook, per-flow incoming webhook).
 *
 * Long runs keep their lease: every step write and heartbeat refreshes
 * `updatedAt`, and writes are fenced on `status = 'running'` so the stale
 * sweep can never terminally reconcile an active run mid-execution.
 */
export async function startFlowRun(opts: {
  flow: FlowRow | (MinimalFlow & { lastRunAt?: Date | null });
  trigger: "manual" | "schedule" | "webhook";
  triggerPayload?: unknown;
  cachedSteps?: FlowStep[];
  fanoutProgress?: Record<string, Record<string, unknown>>;
  approvedNodeIds?: string[];
}): Promise<{ runId: string; status: RunStatus }> {
  const flow = opts.flow;

  const [run] = await db
    .insert(flowRuns)
    .values({
      flowId: flow.id,
      tenantId: flow.tenantId,
      trigger: opts.trigger,
      triggerPayload: opts.triggerPayload ?? null,
      approvedNodeIds: opts.approvedNodeIds ?? [],
    })
    .returning();

  const fenceWhere = () => and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running"));

  const result = await executeFlow(
    flow.graph as Parameters<typeof executeFlow>[0],
    {
      tenantId: flow.tenantId,
      runId: run.id,
      flowId: flow.id,
      triggerPayload: opts.triggerPayload,
      cachedSteps: opts.cachedSteps,
      fanoutProgress: opts.fanoutProgress,
      approvedNodeIds: opts.approvedNodeIds,
    },
    {
      onStepUpdate: async (step) => {
        const current = await db.query.flowRuns.findFirst({
          where: eq(flowRuns.id, run.id),
          columns: { steps: true },
        });
        if (!current) return;
        const steps = ((current.steps as unknown[]) ?? []) as FlowStep[];
        const idx = steps.findIndex((s) => s.nodeId === step.nodeId);
        if (idx >= 0) steps[idx] = step;
        else steps.push(step);
        await db
          .update(flowRuns)
          .set({ steps, updatedAt: new Date() })
          .where(fenceWhere());
      },
      onFanoutProgress: async (fanoutProgress) => {
        await db
          .update(flowRuns)
          .set({ fanoutProgress, updatedAt: new Date() })
          .where(fenceWhere());
      },
      onHeartbeat: async () => {
        await db
          .update(flowRuns)
          .set({ updatedAt: new Date() })
          .where(fenceWhere());
      },
    },
  );

  await db
    .update(flowRuns)
    .set({
      status: result.status,
      steps: result.steps,
      error: result.error ?? null,
      finishedAt: result.status === "waiting_approval" ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(fenceWhere());

  await db.update(flows).set({ lastRunAt: new Date(), updatedAt: new Date() }).where(eq(flows.id, flow.id));

  return { runId: run.id, status: result.status };
}

export async function persistStep(tenantId: string, runId: string, step: FlowStep) {
  const run = await db.query.flowRuns.findFirst({
    where: eq(flowRuns.id, runId),
    columns: { steps: true },
  });
  if (!run) return;
  const steps = ((run.steps as unknown[]) ?? []) as FlowStep[];
  const idx = steps.findIndex((s) => s.nodeId === step.nodeId);
  if (idx >= 0) steps[idx] = step;
  else steps.push(step);
  await db
    .update(flowRuns)
    .set({ steps, updatedAt: new Date() })
    .where(and(eq(flowRuns.id, runId), eq(flowRuns.status, "running")));
}