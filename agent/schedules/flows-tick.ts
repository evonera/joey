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
    // Global backstop FIRST: any run stuck as running for >30 min (from any
    // trigger, including approval resumes on inactive flows) is finalized as
    // failed so it can't suppress scheduling forever.
    await db
      .update(flowRuns)
      .set({
        status: "failed",
        error: "Run timed out (stuck in running).",
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(flowRuns.status, "running"),
          lt(flowRuns.startedAt, new Date(Date.now() - 30 * 60_000)),
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

        // Recover runs stuck as running (e.g. process died mid-execution).
        const staleCutoff = new Date(Date.now() - 30 * 60_000);
        const stale = await db.query.flowRuns.findFirst({
          where: and(
            eq(flowRuns.flowId, flow.id),
            eq(flowRuns.status, "running"),
            lt(flowRuns.startedAt, staleCutoff),
          ),
          columns: { id: true },
        });
        if (stale) {
          await db
            .update(flowRuns)
            .set({ status: "failed", error: "Run timed out (stuck in running).", finishedAt: new Date() })
            .where(eq(flowRuns.id, stale.id));
        }

        // Skip if a run for this flow is still in flight.
        const inFlight = await db.query.flowRuns.findFirst({
          where: and(eq(flowRuns.flowId, flow.id), eq(flowRuns.status, "running")),
          columns: { id: true },
        });
        if (inFlight) continue;

        const [run] = await db
          .insert(flowRuns)
          .values({ flowId: flow.id, tenantId: flow.tenantId, trigger: "schedule" })
          .returning();

        let result;
        try {
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
                  where: eq(flowRuns.id, run.id),
                  columns: { steps: true },
                });
                if (!r) return;
                const steps = ((r.steps as unknown[]) ?? []) as typeof step[];
                const idx = steps.findIndex((st) => st.nodeId === step.nodeId);
                if (idx >= 0) steps[idx] = step;
                else steps.push(step);
                await db.update(flowRuns).set({ steps }).where(eq(flowRuns.id, run.id));
              },
            },
          );
        } finally {
          // A throw mid-execution must never leave the row stuck as running —
          // that would permanently block this flow's future ticks.
          if (result === undefined) {
            await db
              .update(flowRuns)
              .set({
                status: "failed",
                error: "Scheduled execution crashed before finalization.",
                finishedAt: new Date(),
              })
              .where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, "running")));
          }
          await db.update(flows).set({ lastRunAt: new Date() }).where(eq(flows.id, flow.id));
        }

        // Defensive finalize: never let a failed status write strand the row
        // as running (lastRunAt has already advanced, blocking the 30-min
        // stale sweep as a backstop).
        try {
          await db
            .update(flowRuns)
            .set({
              status: result.status,
              steps: result.steps,
              error: result.error ?? null,
              finishedAt: new Date(),
            })
            .where(eq(flowRuns.id, run.id));
        } catch (finErr) {
          // DB unavailable — non-throwing; the global stale-run sweep at the
          // top of every tick is the eventual backstop.
          console.error(`[flows-tick] CRITICAL: run ${run.id} may be stranded as running —`, finErr);
        }
      } catch (err) {
        console.error(`[flows-tick] Flow ${flow.id} failed:`, err);
      }
    }
  },
});
