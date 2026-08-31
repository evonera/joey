/**
 * Flow Builder schedule tick.
 *
 * Eve schedule compliance (per AGENTS.md → node_modules/eve/docs):
 * - Declared with defineSchedule({ cron }) exactly like
 *   agent/schedules/tenant-poll.ts; the eve dev/build runtime discovers and
 *   registers it automatically from agent/schedules/ — no manual wiring.
 * - The handler runs to completion on every fire; long work uses await and
 *   per-item error boundaries so one failure never kills the tick.
 * - Idempotent per interval: active flows are guarded by an in-flight run
 *   check plus lastRunAt spacing, so overlapping ticks are safe.
 */
import { defineSchedule } from "eve/schedules";
import { db } from "@/lib/db";
import { flows, flowRuns } from "@/lib/db/schema";
import { and, eq, lt, or } from "drizzle-orm";
import { getNode } from "@/lib/flows/registry";
import { executeAdmittedFlowRun } from "@/lib/flows/run-flow-server";
import { operationalEvent } from "@/lib/operations-log";

/**
 * Ticks every minute: starts any ACTIVE flow whose trigger is a due
 * trigger.schedule node. Webhook triggers are dispatched from the Zernio
 * receiver instead.
 */
export default defineSchedule({
  cron: "* * * * *",
  async run() {
    // Global backstop FIRST: any run stuck as running with NO heartbeat/update
    // for >30 min (from any trigger, including approval resumes or crashed flows)
    // is reconciled based on its accumulated step execution state. Active runs
    // continuously touch updatedAt every 10s via executor heartbeats and step
    // updates, so legitimate long-running work is never timed out.
    const staleCutoff = new Date(Date.now() - 30 * 60_000);
    const staleRuns = await db.query.flowRuns.findMany({
      where: and(
        eq(flowRuns.status, "running"),
        lt(flowRuns.updatedAt, staleCutoff),
      ),
      columns: { id: true, flowId: true, steps: true, fanoutProgress: true },
    });

    for (const stale of staleRuns) {
      const steps = ((stale.steps as unknown[]) ?? []) as {
        nodeId: string;
        status: string;
        branch?: string;
        input?: unknown;
        output?: unknown;
        error?: string;
      }[];
      const hasWaitingApproval = steps.some((s) => s.status === "waiting_approval");

      let resolvedStatus: "failed" | "waiting_approval" | "succeeded" = "failed";
      let errorMsg: string | null = "Run timed out (no heartbeat activity for 30 minutes).";

      if (hasWaitingApproval) {
        resolvedStatus = "waiting_approval";
        errorMsg = null;
      } else {
        const failedStep = steps.find((s) => s.status === "failed");
        if (failedStep?.error) {
          errorMsg = `Step failed: ${failedStep.error}`;
        } else {
          const flow = await db.query.flows.findFirst({
            where: eq(flows.id, stale.flowId),
            columns: { graph: true },
          });
          if (
            flow?.graph &&
            isGraphFullyCompleted(
              flow.graph,
              steps,
              stale.fanoutProgress as Record<string, Record<string, unknown>>,
            )
          ) {
            resolvedStatus = "succeeded";
            errorMsg = null;
          }
        }
      }

      const reconciled = await db
        .update(flowRuns)
        .set({
          status: resolvedStatus,
          error: errorMsg,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(flowRuns.id, stale.id),
            eq(flowRuns.status, "running"),
            lt(flowRuns.updatedAt, staleCutoff),
          ),
        )
        .returning({ id: flowRuns.id, tenantId: flowRuns.tenantId });
      if (reconciled[0]) {
        operationalEvent(resolvedStatus === "failed" ? "error" : "warn", "flow_run.stale_reconciled", {
          tenantId: reconciled[0].tenantId,
          flowId: stale.flowId,
          runId: stale.id,
          status: resolvedStatus,
          error: errorMsg,
        });
      }
    }

    // Run cleanup only after stale reconciliation. Reservations owned by a
    // live run remain protected; abandoned runs have now become terminal.
    const { processR2CleanupTasks } = await import("@/lib/storage-cleanup");
    await processR2CleanupTasks();

    const { recoverStaleWebhookDeliveries } = await import("@/lib/flows/incoming-webhooks");
    await recoverStaleWebhookDeliveries();

    const activeFlows = await db.query.flows.findMany({
      where: eq(flows.status, "active"),
    });

    await Promise.allSettled(
      activeFlows.map(async (flow) => {
        try {
          const graph = flow.graph as { nodes?: { id: string; type: string; config?: Record<string, unknown> }[] };
          const triggerNode = graph.nodes?.find((n) => n.type === "trigger.schedule");
          if (!triggerNode) return;

          const def = getNode("trigger.schedule");
          const parsed = def?.configSchema.safeParse(triggerNode.config ?? {});
          if (!parsed?.success) return;
          const config = parsed.data as { intervalMinutes: number };

          // Cadence is anchored only to scheduled admissions. `lastRunAt` is
          // intentionally generic UI activity and may be changed by manual or
          // webhook runs on a mixed-trigger flow.
          const latestScheduledRun = await db.query.flowRuns.findFirst({
            where: and(
              eq(flowRuns.flowId, flow.id),
              eq(flowRuns.tenantId, flow.tenantId),
              eq(flowRuns.trigger, "schedule"),
            ),
            columns: { startedAt: true },
            orderBy: (runs, { desc }) => [desc(runs.startedAt)],
          });
          if (!isScheduleDue(latestScheduledRun?.startedAt, config.intervalMinutes)) return;

          // Skip if any run for this flow is still in flight — a WAITING
          // approval also occupies the slot (it will transition back to
          // running on approval), so a later tick must not admit another.
          const inFlight = await db.query.flowRuns.findFirst({
            where: and(
              eq(flowRuns.flowId, flow.id),
              or(
                eq(flowRuns.status, "running"),
                eq(flowRuns.status, "waiting_approval"),
              ),
            ),
            columns: { id: true },
          });
          if (inFlight) return;

          // Atomic admission: partial unique index (flow_runs_running_scheduled_idx) guarantees
          // at most one running scheduled execution per flow across concurrent scheduler invocations.
          const triggerPayload = { scheduledAt: new Date().toISOString() };
          let run;
          try {
            const inserted = await db
              .insert(flowRuns)
              .values({
                flowId: flow.id,
                tenantId: flow.tenantId,
                trigger: "schedule",
                triggerPayload,
              })
              .onConflictDoNothing()
              .returning();
            run = inserted[0];
          } catch (err: any) {
            if (err?.code === "23505" || err?.message?.includes("unique")) {
              return;
            }
            throw err;
          }
          if (!run) return;

          // Advance cadence immediately after atomic admission. The shared run
          // service owns all subsequent persistence, heartbeat, and finalization.
          await db
            .update(flows)
            .set({ lastRunAt: new Date(), updatedAt: new Date() })
            .where(and(eq(flows.id, flow.id), eq(flows.tenantId, flow.tenantId)));
          const execution = await executeAdmittedFlowRun({
            flow,
            runId: run.id,
            triggerPayload,
          });
          if (!execution.persisted) {
            console.error(`[flows-tick] Run ${run.id} could not persist its terminal state: ${execution.error}`);
          }
        } catch (err) {
          console.error(`[flows-tick] Flow ${flow.id} failed:`, err);
        }
      }),
    );
  },
});

export function isScheduleDue(
  lastScheduledStartedAt: Date | null | undefined,
  intervalMinutes: number,
  now = Date.now(),
): boolean {
  if (!lastScheduledStartedAt) return true;
  return now - lastScheduledStartedAt.getTime() >= intervalMinutes * 60_000;
}

export function isGraphFullyCompleted(
  graph: unknown,
  steps: { nodeId: string; status: string; branch?: string; input?: unknown; output?: unknown }[],
  fanoutProgress?: Record<string, Record<string, unknown>>,
): boolean {
  if (!graph || typeof graph !== "object") return false;
  const g = graph as {
    nodes?: { id: string; type: string }[];
    edges?: { id: string; from?: string; to?: string; source?: string; target?: string; branch?: string | null; sourceHandle?: string | null }[];
  };
  const nodes = g.nodes ?? [];
  const edges = (g.edges ?? []).map((e) => ({
    source: e.from ?? e.source ?? "",
    target: e.to ?? e.target ?? "",
    sourceHandle: e.branch ?? e.sourceHandle ?? null,
  }));
  if (nodes.length === 0) return false;

  const stepsByNodeId = new Map(steps.map((s) => [s.nodeId, s]));

  // Check all fan-out loop nodes in the graph
  const forEachNodes = nodes.filter((n) => n.type === "logic.loop" || n.type === "logic.forEach");
  for (const feNode of forEachNodes) {
    const feStep = stepsByNodeId.get(feNode.id);
    if (!feStep || feStep.status !== "succeeded") return false;
    const items = Array.isArray(feStep.output)
      ? feStep.output
      : Array.isArray(feStep.input)
        ? feStep.input
        : (feStep.input as any)?.data && Array.isArray((feStep.input as any).data)
          ? (feStep.input as any).data
          : null;
    if (!items) return false;
    if (items.length > 0) {
      if (!fanoutProgress) return false;
      // Find downstream chain nodes inside the fan-out
      const chainNodes = new Set<string>();
      const q = [feNode.id];
      while (q.length > 0) {
        const c = q.shift()!;
        for (const e of edges) {
          if (e.source === c) {
            chainNodes.add(e.target);
            q.push(e.target);
          }
        }
      }
      // Compute all prefix paths from ancestor loops
      const ancestorLoops: { id: string; count: number }[] = [];
      const visited = new Set<string>();
      const aq = [feNode.id];
      while (aq.length > 0) {
        const curr = aq.shift()!;
        for (const e of edges) {
          if (e.target === curr && !visited.has(e.source)) {
            visited.add(e.source);
            const srcNode = nodes.find((n) => n.id === e.source);
            if (srcNode && (srcNode.type === "logic.loop" || srcNode.type === "logic.forEach")) {
              const pStep = stepsByNodeId.get(srcNode.id);
              const pItems = Array.isArray(pStep?.output)
                ? pStep.output
                : Array.isArray(pStep?.input)
                  ? pStep.input
                  : (pStep?.input as any)?.data && Array.isArray((pStep?.input as any).data)
                    ? (pStep?.input as any).data
                    : null;
              if (pItems && Array.isArray(pItems)) {
                ancestorLoops.unshift({ id: srcNode.id, count: pItems.length });
              }
            }
            aq.push(e.source);
          }
        }
      }

      // Generate all fully-qualified prefix paths
      let prefixes: string[] = [""];
      for (const anc of ancestorLoops) {
        const nextPrefixes: string[] = [];
        for (const p of prefixes) {
          for (let pi = 0; pi < anc.count; pi++) {
            nextPrefixes.push(p ? `${p}/${anc.id}:${pi}` : `${anc.id}:${pi}`);
          }
        }
        prefixes = nextPrefixes;
      }

      for (const prefix of prefixes) {
        for (let i = 0; i < items.length; i++) {
          const itemKey = prefix ? `${prefix}/${feNode.id}:${i}` : `${feNode.id}:${i}`;
          const itemProg = fanoutProgress[itemKey] ?? (prefix === "" ? fanoutProgress[String(i)] : undefined);
          if (!itemProg) return false;
          // Verify every non-skipped node in chain has recorded progress for this item
          for (const chainId of chainNodes) {
            const chainStep = stepsByNodeId.get(chainId);
            if (chainStep?.status === "succeeded" && !(chainId in itemProg)) {
              return false;
            }
          }
        }
      }
    }
  }

  // Find root / trigger nodes
  const targets = new Set(edges.map((e) => e.target));
  const rootNodes = nodes.filter((n) => !targets.has(n.id) || n.type.startsWith("trigger."));
  if (rootNodes.length === 0) return false;

  const queue: string[] = rootNodes.map((n) => n.id);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currId = queue.shift()!;
    if (visited.has(currId)) continue;
    visited.add(currId);

    const step = stepsByNodeId.get(currId);
    // If a reachable node was not executed or did not succeed/skip, it did not complete successfully
    if (!step || (step.status !== "succeeded" && step.status !== "skipped")) {
      return false;
    }

    // Find downstream neighbors
    for (const edge of edges) {
      if (edge.source !== currId) continue;
      // If the node is a branch/condition node and recorded a branch decision, follow only the taken branch
      if (step.branch !== undefined && edge.sourceHandle && edge.sourceHandle !== step.branch) {
        continue;
      }
      queue.push(edge.target);
    }
  }

  // All reachable nodes have succeeded or skipped!
  return visited.size > 0;
}
