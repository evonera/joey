import { defineSchedule } from "eve/schedules";
import { db } from "@/lib/db";
import { flows, flowRuns } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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

        const result = await executeFlow(
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
              const idx = steps.findIndex((s) => s.nodeId === step.nodeId);
              if (idx >= 0) steps[idx] = step;
              else steps.push(step);
              await db.update(flowRuns).set({ steps }).where(eq(flowRuns.id, run.id));
            },
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
      } catch (err) {
        console.error(`[flows-tick] Flow ${flow.id} failed:`, err);
      }
    }
  },
});
