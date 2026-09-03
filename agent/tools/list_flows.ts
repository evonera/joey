import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export default defineTool({
  description:
    "List the user's automated workflow pipelines (Flows), returning their IDs, names, descriptions, statuses (active, draft, paused), and triggers.",
  inputSchema: z.object({
    status: z
      .enum(["all", "active", "draft", "paused"])
      .optional()
      .default("all")
      .describe("Optional status filter for flows."),
  }),
  execute: async ({ status }, ctx) => {
    const tenantId = ctx.session?.auth?.current?.attributes?.tenantId as string | undefined;
    if (!tenantId) {
      return { error: "No active tenant session found. Please sign in to view flows." };
    }

    const rows = await db.query.flows.findMany({
      where: eq(flows.tenantId, tenantId),
      orderBy: [desc(flows.updatedAt)],
    });

    const filtered = status === "all" ? rows : rows.filter((r) => r.status === status);

    const summaries = filtered.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      status: f.status,
      executionRevision: f.executionRevision,
      url: `/flows/${f.id}`,
      lastTickedAt: f.lastTickedAt,
      createdAt: f.createdAt,
    }));

    return {
      count: summaries.length,
      flows: summaries,
      message:
        summaries.length === 0
          ? "No flows found. You can ask Joey to create one using a template!"
          : `Found ${summaries.length} flows.`,
    };
  },
});
