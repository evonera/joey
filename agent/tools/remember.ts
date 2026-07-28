import { defineTool } from "eve/tools";
import { z } from "zod";
import { insertMemory } from "@/lib/memories";

export default defineTool({
  description: "Save a durable fact, observation, or strategy insight to long-term memory. Use this to remember patterns you discover during analysis — the insight will be searchable by the agent in future sessions.",
  inputSchema: z.object({
    content: z.string().min(1).max(4000).describe("The fact or insight to remember, phrased as an actionable observation."),
    type: z.enum(["strategy_insight", "brand_guideline", "published_post"]).default("strategy_insight").describe("What kind of memory this is. Use strategy_insight for analytics-driven observations."),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Optional structured data (e.g. { source: 'weekly-review', week: '2024-12' })."),
  }),
  execute: async ({ content, type, metadata }, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    if (!tenantId) throw new Error("Unable to identify tenant from session auth.");

    const memory = await insertMemory(
      tenantId as string,
      content,
      type,
      { ...metadata, source: "agent", createdAt: new Date().toISOString() },
    );

    return { id: memory.id, message: "Insight saved to memory." };
  },
});
