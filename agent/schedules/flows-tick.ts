import { defineSchedule } from "eve/schedules";
import { db } from "@/lib/db";
import { flows, flowRuns } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
const { startFlowRun } = await import("@/lib/flows/run-flow-server");
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

        await startFlowRun({
          flow,
          trigger: "schedule",
          triggerPayload: { scheduledAt: new Date().toISOString() },
        });
      } catch (err) {
        console.error(`[flows-tick] Flow ${flow.id} failed:`, err);
      }
    }
  },
});
