import { defineTool } from "eve/tools";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memories } from "@/lib/db/schema";

export default defineTool({
  description:
    "Delete one long-term memory by id. Use only during memory consolidation to remove exact duplicates, superseded entries, or spent one-off context you just merged elsewhere. When in doubt, keep the memory.",
  inputSchema: z.object({
    id: z.string().min(1).max(100).describe("The memory id from list_memories."),
  }),
  execute: async ({ id }, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    if (!tenantId) throw new Error("Unable to identify tenant from session auth.");

    // Tenant fence on the write itself: ids are unguessable but must never
    // resolve across workspaces even if one leaks into another session.
    const [deleted] = await db
      .delete(memories)
      .where(and(eq(memories.id, id), eq(memories.tenantId, tenantId as string)))
      .returning({ id: memories.id });

    if (!deleted) throw new Error("Memory not found in this workspace.");
    return { id: deleted.id, message: "Memory forgotten." };
  },
});
