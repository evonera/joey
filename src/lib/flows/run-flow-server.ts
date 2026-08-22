import { db } from "@/lib/db";
import { flows, flowRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
 */
export async function startFlowRun(opts: {
  flow: FlowRow | (MinimalFlow & { lastRunAt?: Date | null });
  trigger: "manual" | "schedule" | "webhook";
  triggerPayload?: unknown;
  cachedOutputs?: Record<string, unknown>;
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

  const result = await executeFlow(
    flow.graph as Parameters<typeof executeFlow>[0],
    {
      tenantId: flow.tenantId,
      runId: run.id,
      flowId: flow.id,
      triggerPayload: opts.triggerPayload,
      cachedOutputs: opts.cachedOutputs,
      approvedNodeIds: opts.approvedNodeIds,
    },
    {
      onStepUpdate: (step) => persistStep(flow.tenantId, run.id, step),
    },
  );

  await db
    .update(flowRuns)
    .set({
      status: result.status,
      steps: result.steps,
      error: result.error ?? null,
      finishedAt: new Date(),
    })
    .where(eq(flowRuns.id, run.id));

  await db.update(flows).set({ lastRunAt: new Date() }).where(eq(flows.id, flow.id));

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
  await db.update(flowRuns).set({ steps }).where(eq(flowRuns.id, runId));
}
