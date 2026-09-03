import { defineTool } from "eve/tools";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memories } from "@/lib/db/schema";

const memoryType = z.enum(["published_post", "strategy_insight", "brand_guideline"]);

export default defineTool({
  description:
    "List stored long-term memories for this workspace, newest first. Page through with limit/offset during memory reviews. Never returns embedding vectors.",
  inputSchema: z.object({
    limit: z.number().min(1).max(50).default(20).describe("Max entries per page."),
    offset: z.number().min(0).max(10000).default(0).describe("Entries to skip for pagination."),
    type: memoryType.optional().describe("Filter to a specific memory type."),
    oldestFirst: z.boolean().default(false).describe("Sort oldest first instead of newest first."),
  }),
  execute: async ({ limit, offset, type, oldestFirst }, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    if (!tenantId) throw new Error("Unable to identify tenant from session auth.");

    const rows = await db.query.memories.findMany({
      where: type
        ? and(eq(memories.tenantId, tenantId as string), eq(memories.type, type))
        : eq(memories.tenantId, tenantId as string),
      orderBy: [oldestFirst ? asc(memories.createdAt) : desc(memories.createdAt)],
      limit,
      offset,
      columns: { id: true, content: true, type: true, metadata: true, createdAt: true },
    });

    return {
      memories: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      count: rows.length,
    };
  },
});
