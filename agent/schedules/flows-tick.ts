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
import { executeFlow } from "@/lib/flows/executor";
import { getNode } from "@/lib/flows/registry";

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
      columns: { id: true, steps: true },
    });

    for (const stale of staleRuns) {
      const steps = ((stale.steps as unknown[]) ?? []) as { status: string; error?: string }[];
      const hasWaitingApproval = steps.some((s) => s.status === "waiting_approval");
      const hasFailure = steps.some((s) => s.status === "failed");
      const hasWorking = steps.some((s) => s.status === "working");
      const allDone = steps.length > 0 && steps.every((s) => s.status === "succeeded" || s.status === "skipped");

      let resolvedStatus: "succeeded" | "failed" | "waiting_approval" = "failed";
      let errorMsg: string | null = "Run timed out (no heartbeat activity for 30 minutes).";

      if (hasWaitingApproval) {
        resolvedStatus = "waiting_approval";
        errorMsg = null;
      } else if (allDone && !hasFailure && !hasWorking) {
        resolvedStatus = "succeeded";
        errorMsg = null;
      } else if (hasFailure) {
        const failedStep = steps.find((s) => s.status === "failed");
        resolvedStatus = "failed";
        errorMsg = failedStep?.error ? `Step failed: ${failedStep.error}` : "One or more steps failed.";
      }

      await db
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
        );
    }

    const activeFlows = await db.query.flows.findMany({
      where: eq(flows.status, "active"),
    });

    for (const flow of activeFlows) {
      try {
        const graph = flow.graph as { nodes?: { id: string; type: string; config?: Record<string, unknown> }[] };
        const triggerNode = graph.nodes?.find((n) => n.type === "trigger.schedule");
        if (!triggerNode) continue;

        const def = getNode("trigger.schedule");
        const parsed = def?.configSchema.safeParse(triggerNode.config ?? {});
        if (!parsed?.success) continue;
        const config = parsed.data as { intervalMinutes: number };

        if (flow.lastRunAt) {
          const elapsed = Date.now() - flow.lastRunAt.getTime();
          if (elapsed < config.intervalMinutes * 60_000) continue;
        }

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
        if (inFlight) continue;

        // Atomic admission: partial unique index (flow_runs_running_scheduled_idx) guarantees
        // at most one running scheduled execution per flow across concurrent scheduler invocations.
        let run;
        try {
          const inserted = await db
            .insert(flowRuns)
            .values({
              flowId: flow.id,
              tenantId: flow.tenantId,
              trigger: "schedule",
              triggerPayload: { scheduledAt: new Date().toISOString() },
            })
            .onConflictDoNothing()
            .returning();
          run = inserted[0];
        } catch (err: any) {
          if (err?.code === "23505" || err?.message?.includes("unique")) {
            continue;
          }
          throw err;
        }
        if (!run) continue;

        let result;
        let execError: unknown;
        try {
          // Advance lastRunAt immediately upon admission so concurrent / subsequent ticks
          // in this interval observe the new cadence window immediately.
          await db
            .update(flows)
            .set({ lastRunAt: new Date(), updatedAt: new Date() })
            .where(eq(flows.id, flow.id));

          result = await executeFlow(
            flow.graph as Parameters<typeof executeFlow>[0],
            {
              tenantId: flow.tenantId,
              runId: run.id,
              flowId: flow.id,
              triggerPayload: { scheduledAt: new Date().toISOString() },
            },
            {
              onStepUpdate: async (step) => {
                const r = await db.query.flowRuns.findFirst({
                  where: and(eq(flowRuns.id, run.id), eq(flowRuns.tenantId, flow.tenantId)),
                  columns: { steps: true, status: true },
                });
                if (!r || r.status !== "running") {
                  throw new Error("Execution fenced: run was transitioned out of running by stale recovery.");
                }
                const steps = ((r.steps as unknown[]) ?? []) as typeof step[];
                const idx = steps.findIndex((st) => st.nodeId === step.nodeId);
                if (idx >= 0) steps[idx] = step;
                else steps.push(step);
                const updated = await db
                  .update(flowRuns)
                  .set({ steps, updatedAt: new Date() })
                  .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")))
                  .returning({ id: flowRuns.id });
                if (updated.length === 0) {
                  throw new Error("Execution fenced: update rejected because run is no longer running.");
                }
              },
              onFanoutProgress: async (fanoutProgress) => {
                const updated = await db
                  .update(flowRuns)
                  .set({ fanoutProgress, updatedAt: new Date() })
                  .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")))
                  .returning({ id: flowRuns.id });
                if (updated.length === 0) {
                  throw new Error("Execution fenced: fan-out update rejected because run is no longer running.");
                }
              },
              onHeartbeat: async () => {
                const updated = await db
                  .update(flowRuns)
                  .set({ updatedAt: new Date() })
                  .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")))
                  .returning({ id: flowRuns.id });
                if (updated.length === 0) {
                  throw new Error("Execution fenced: heartbeat rejected because run is no longer running.");
                }
              },
            },
          );
        } catch (err) {
          execError = err;
        } finally {
          // Resilient two-stage finalization with retries:
          // 1. If result exists, attempt primary write with full steps & status.
          // 2. If primary write fails or executeFlow threw, apply minimal fallback so run
          //    is guaranteed to reach a terminal status and never dangles as 'running'.
          const status = result ? result.status : "failed";
          const error =
            result?.error ??
            (execError instanceof Error
              ? execError.message
              : execError
                ? String(execError)
                : null);
          const finishedAt = new Date();
          const updatedAt = new Date();

          let finalized = false;
          for (let attempt = 0; attempt < 5 && !finalized; attempt++) {
            if (result) {
              try {
                const updated = await db
                  .update(flowRuns)
                  .set({
                    status,
                    steps: result.steps,
                    error,
                    finishedAt,
                    updatedAt,
                  })
                  .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")))
                  .returning({ id: flowRuns.id });
                if (updated.length > 0) finalized = true;
              } catch (finErr) {
                console.warn(`[flows-tick] Rich finalization attempt ${attempt + 1} failed for ${run.id}:`, finErr);
              }
            }

            if (!finalized) {
              try {
                const updated = await db
                  .update(flowRuns)
                  .set({
                    status,
                    error: error ?? "Execution finalized with minimal fallback.",
                    finishedAt,
                    updatedAt,
                  })
                  .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")))
                  .returning({ id: flowRuns.id });
                if (updated.length > 0) finalized = true;
              } catch (fallbackErr) {
                console.error(`[flows-tick] Minimal finalization attempt ${attempt + 1} failed for ${run.id}:`, fallbackErr);
              }
            }

            if (!finalized) {
              try {
                const updated = await db
                  .update(flowRuns)
                  .set({
                    status,
                    finishedAt,
                    updatedAt,
                  })
                  .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")))
                  .returning({ id: flowRuns.id });
                if (updated.length > 0) finalized = true;
              } catch (bareErr) {
                console.error(`[flows-tick] Bare finalization attempt ${attempt + 1} failed for ${run.id}:`, bareErr);
              }
            }

            // Check if already finalized by stale recovery or another path
            if (!finalized) {
              try {
                const existing = await db.query.flowRuns.findFirst({
                  where: eq(flowRuns.id, run.id),
                  columns: { status: true },
                });
                if (existing && existing.status !== "running") {
                  finalized = true;
                }
              } catch {}
            }

            if (!finalized && attempt < 4) {
              await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)));
            }
          }

          if (!finalized) {
            console.error(
              `[flows-tick] CRITICAL: Finalization writes exhausted for run ${run.id}. Run remains persisted with accumulated steps; stale recovery will transition it when DB recovers.`,
            );
          }

          try {
            await db.update(flows).set({ lastRunAt: new Date(), updatedAt: new Date() }).where(eq(flows.id, flow.id));
          } catch {}
        }
      } catch (err) {
        console.error(`[flows-tick] Flow ${flow.id} failed:`, err);
      }
    }
  },
});
