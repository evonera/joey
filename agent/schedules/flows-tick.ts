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
import { eq, and, lt } from "drizzle-orm";
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
    // for >30 min (from any trigger, including approval resumes on inactive flows)
    // is finalized as failed so it can't suppress scheduling forever. Active runs
    // continuously touch updatedAt via step and fan-out updates, so legitimate
    // long-running work is never timed out.
    const staleCutoff = new Date(Date.now() - 30 * 60_000);
    await db
      .update(flowRuns)
      .set({
        status: "failed",
        error: "Run timed out (no activity for 30 minutes).",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(flowRuns.status, "running"),
          lt(flowRuns.updatedAt, staleCutoff),
        ),
      );

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

        // Recover runs stuck as running without activity (e.g. process died mid-execution).
        const flowStale = await db.query.flowRuns.findFirst({
          where: and(
            eq(flowRuns.flowId, flow.id),
            eq(flowRuns.status, "running"),
            lt(flowRuns.updatedAt, staleCutoff),
          ),
          columns: { id: true },
        });
        if (flowStale) {
          await db
            .update(flowRuns)
            .set({
              status: "failed",
              error: "Run timed out (no activity for 30 minutes).",
              finishedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(flowRuns.id, flowStale.id), eq(flowRuns.status, "running")));
        }

        // Skip if any run for this flow is still actively in flight.
        const inFlight = await db.query.flowRuns.findFirst({
          where: and(eq(flowRuns.flowId, flow.id), eq(flowRuns.status, "running")),
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
                  columns: { steps: true },
                });
                if (!r) return;
                const steps = ((r.steps as unknown[]) ?? []) as typeof step[];
                const idx = steps.findIndex((st) => st.nodeId === step.nodeId);
                if (idx >= 0) steps[idx] = step;
                else steps.push(step);
                await db
                  .update(flowRuns)
                  .set({ steps, updatedAt: new Date() })
                  .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")));
              },
              onFanoutProgress: async (fanoutProgress) => {
                await db
                  .update(flowRuns)
                  .set({ fanoutProgress, updatedAt: new Date() })
                  .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")));
              },
              onHeartbeat: async () => {
                await db
                  .update(flowRuns)
                  .set({ updatedAt: new Date() })
                  .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")));
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
          for (let attempt = 0; attempt < 3 && !finalized; attempt++) {
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

            if (!finalized && attempt < 2) {
              await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
            }
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
