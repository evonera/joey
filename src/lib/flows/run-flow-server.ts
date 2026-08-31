import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { flows, flowRuns } from "@/lib/db/schema";
import { executeFlow } from "./executor";
import type { FlowStep, RunStatus } from "./types";

export type RunnableFlow = {
  id: string;
  tenantId: string;
  graph: unknown;
};

type RunExecutionOptions = {
  flow: RunnableFlow;
  runId: string;
  triggerPayload?: unknown;
  cachedSteps?: FlowStep[];
  fanoutProgress?: Record<string, Record<string, unknown>>;
  approvedNodeIds?: string[];
  /** Fences deferred webhook execution to the graph/status revision it claimed. */
  flowRevision?: number;
};

export type FlowRunExecutionResult = {
  runId: string;
  status: RunStatus;
  persisted: boolean;
  error?: string;
};

const FENCE_ERROR = "Execution fenced: run is no longer running.";
const FLOW_REVISION_FENCE_ERROR = "Execution fenced: flow was paused or edited.";

function runFence(runId: string, tenantId: string) {
  return and(
    eq(flowRuns.id, runId),
    eq(flowRuns.tenantId, tenantId),
    eq(flowRuns.status, "running"),
  );
}

export function terminalTimestamp(status: RunStatus, now = new Date()): Date | null {
  return status === "waiting_approval" ? null : now;
}

export async function persistFlowStep(
  tenantId: string,
  runId: string,
  step: FlowStep,
  fanoutProgress?: Record<string, Record<string, unknown>>,
): Promise<void> {
  const run = await db.query.flowRuns.findFirst({
    where: and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId)),
    columns: { steps: true, status: true },
  });
  if (!run || run.status !== "running") throw new Error(FENCE_ERROR);

  const steps = [...(((run.steps as FlowStep[]) ?? []))];
  const index = steps.findIndex((candidate) => candidate.nodeId === step.nodeId);
  if (index >= 0) steps[index] = step;
  else steps.push(step);

  const updated = await db
    .update(flowRuns)
    .set({
      steps,
      ...(fanoutProgress ? { fanoutProgress } : {}),
      updatedAt: new Date(),
    })
    .where(runFence(runId, tenantId))
    .returning({ id: flowRuns.id });
  if (updated.length === 0) throw new Error(FENCE_ERROR);
}

export async function finalizeFlowRun(
  runId: string,
  tenantId: string,
  outcome: { status: RunStatus; steps?: FlowStep[]; error?: string | null } | Error,
): Promise<FlowRunExecutionResult> {
  const failed = outcome instanceof Error;
  const status: RunStatus = failed ? "failed" : outcome.status;
  const steps = failed ? undefined : outcome.steps;
  const error = failed ? outcome.message : (outcome.error ?? null);

  for (let attempt = 0; attempt < 5; attempt++) {
    const now = new Date();
    const common = {
      status,
      error,
      finishedAt: terminalTimestamp(status, now),
      updatedAt: now,
    };

    try {
      const updated = await db
        .update(flowRuns)
        .set({ ...common, ...(steps !== undefined ? { steps } : {}) })
        .where(runFence(runId, tenantId))
        .returning({ id: flowRuns.id });
      if (updated.length > 0) return { runId, status, persisted: true };
    } catch (primaryError) {
      console.warn(`[flow-finalize] Rich finalization attempt ${attempt + 1} failed for ${runId}:`, primaryError);
    }

    try {
      const updated = await db
        .update(flowRuns)
        .set(common)
        .where(runFence(runId, tenantId))
        .returning({ id: flowRuns.id });
      if (updated.length > 0) return { runId, status, persisted: true };
    } catch (fallbackError) {
      console.error(`[flow-finalize] Minimal finalization attempt ${attempt + 1} failed for ${runId}:`, fallbackError);
    }

    try {
      const existing = await db.query.flowRuns.findFirst({
        where: and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId)),
        columns: { status: true },
      });
      if (existing && existing.status !== "running") {
        return { runId, status: existing.status as RunStatus, persisted: true };
      }
    } catch {}

    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
    }
  }

  return {
    runId,
    status,
    persisted: false,
    error: "Failed to persist terminal flow-run status after retries.",
  };
}

/** Executes a run row that has already been atomically admitted or claimed. */
export async function executeAdmittedFlowRun(
  opts: RunExecutionOptions,
): Promise<FlowRunExecutionResult> {
  let result: Awaited<ReturnType<typeof executeFlow>> | undefined;
  let executionError: unknown;

  const assertFlowRevision = async () => {
    if (!opts.flowRevision) return;
    const current = await db.query.flows.findFirst({
      where: and(
        eq(flows.id, opts.flow.id),
        eq(flows.tenantId, opts.flow.tenantId),
        eq(flows.status, "active"),
        eq(flows.executionRevision, opts.flowRevision),
      ),
      columns: { id: true },
    });
    if (!current) throw new Error(FLOW_REVISION_FENCE_ERROR);
  };

  try {
    result = await executeFlow(
      opts.flow.graph as Parameters<typeof executeFlow>[0],
      {
        tenantId: opts.flow.tenantId,
        runId: opts.runId,
        flowId: opts.flow.id,
        triggerPayload: opts.triggerPayload,
        cachedSteps: opts.cachedSteps,
        fanoutProgress: opts.fanoutProgress,
        approvedNodeIds: opts.approvedNodeIds,
      },
      {
        onStepUpdate: async (step, progress) => {
          await assertFlowRevision();
          await persistFlowStep(opts.flow.tenantId, opts.runId, step, progress);
        },
        onFanoutProgress: async (progress) => {
          await assertFlowRevision();
          const updated = await db
            .update(flowRuns)
            .set({ fanoutProgress: progress, updatedAt: new Date() })
            .where(runFence(opts.runId, opts.flow.tenantId))
            .returning({ id: flowRuns.id });
          if (updated.length === 0) throw new Error(FENCE_ERROR);
        },
        onHeartbeat: async () => {
          await assertFlowRevision();
          const updated = await db
            .update(flowRuns)
            .set({ updatedAt: new Date() })
            .where(runFence(opts.runId, opts.flow.tenantId))
            .returning({ id: flowRuns.id });
          if (updated.length === 0) throw new Error(FENCE_ERROR);
        },
      },
    );
  } catch (error) {
    executionError = error;
  }

  const finalized = await finalizeFlowRun(
    opts.runId,
    opts.flow.tenantId,
    result
      ? { status: result.status, steps: result.steps, error: result.error ?? null }
      : executionError instanceof Error
        ? executionError
        : new Error(String(executionError ?? "Flow execution crashed")),
  );

  if (finalized.status === "waiting_approval" && result?.pendingApproval) {
    try {
      const { notifyTelegramApproval } = await import("@/lib/telegram-approvals");
      await notifyTelegramApproval({ tenantId: opts.flow.tenantId, runId: opts.runId, prompt: result.pendingApproval.prompt });
    } catch (error) {
      console.error("[telegram] failed to queue approval notification", error instanceof Error ? error.message : "unknown error");
    }
  }

  await db
    .update(flows)
    .set({ lastRunAt: new Date(), updatedAt: new Date() })
    .where(and(eq(flows.id, opts.flow.id), eq(flows.tenantId, opts.flow.tenantId)));

  return finalized;
}

/** Atomically creates a run, then delegates all execution and fencing. */
export async function startFlowRun(opts: {
  flow: RunnableFlow;
  trigger: "manual" | "schedule" | "webhook";
  triggerPayload?: unknown;
  cachedSteps?: FlowStep[];
  fanoutProgress?: Record<string, Record<string, unknown>>;
  approvedNodeIds?: string[];
}): Promise<FlowRunExecutionResult> {
  const [run] = await db
    .insert(flowRuns)
    .values({
      flowId: opts.flow.id,
      tenantId: opts.flow.tenantId,
      trigger: opts.trigger,
      triggerPayload: opts.triggerPayload ?? null,
      steps: opts.cachedSteps ?? [],
      fanoutProgress: opts.fanoutProgress ?? {},
      approvedNodeIds: opts.approvedNodeIds ?? [],
    })
    .returning({ id: flowRuns.id });

  return executeAdmittedFlowRun({ ...opts, runId: run.id });
}
