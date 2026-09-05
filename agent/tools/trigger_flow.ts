import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import { startFlowRun } from "@/lib/flows/run-flow-server";

export default defineTool({
  description:
    "Trigger and execute an automated workflow pipeline (Flow) manually by its Flow ID or name. Runs the flow graph and returns the execution run ID and status.",
  inputSchema: z.object({
    flowIdOrName: z
      .string()
      .min(1)
      .describe("The ID or approximate name of the flow to run (e.g. 'Daily AI News Curator' or flow UUID)."),
    parameters: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Optional key-value parameters to pass as the trigger payload to the flow nodes."),
  }),
  execute: async ({ flowIdOrName, parameters }, ctx) => {
    const tenantId = ctx.session?.auth?.current?.attributes?.tenantId as string | undefined;
    if (!tenantId) {
      return { error: "No active tenant session found. Please sign in to run flows." };
    }

    const trimmed = flowIdOrName.trim();

    // Look up by exact ID or case-insensitive name match
    let flow = await db.query.flows.findFirst({
      where: and(
        eq(flows.tenantId, tenantId),
        or(eq(flows.id, trimmed), ilike(flows.name, trimmed))
      ),
    });

    if (!flow) {
      // Try substring match on name, ensuring it is not ambiguous
      const matching = await db.query.flows.findMany({
        where: and(
          eq(flows.tenantId, tenantId),
          ilike(flows.name, `%${trimmed}%`)
        ),
        limit: 3,
      });

      if (matching.length > 1) {
        return {
          error: `Multiple flows matched "${flowIdOrName}": ${matching.map((f) => `"${f.name}" (${f.id})`).join(", ")}. Please specify the exact flow ID or exact name.`,
        };
      }
      flow = matching[0] ?? null;
    }

    if (!flow) {
      return {
        error: `Could not find any flow matching "${flowIdOrName}". Use the list_flows tool to inspect existing flows.`,
      };
    }

    try {
      const result = await startFlowRun({
        flow,
        trigger: "manual",
        triggerPayload: parameters ?? null,
      });

      return {
        success: true,
        runId: result.runId,
        flowId: flow.id,
        flowName: flow.name,
        persisted: result.persisted,
        url: `/flows/${flow.id}?runId=${result.runId}`,
        message: `Successfully initiated manual run for "${flow.name}" (Run ID: ${result.runId}).`,
      };
    } catch (err: any) {
      console.error(`[trigger_flow] Failed to start flow run:`, err);
      return {
        error: `Failed to execute flow "${flow.name}": ${err?.message || "Internal error"}`,
      };
    }
  },
});
