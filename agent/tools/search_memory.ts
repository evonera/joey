import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchMemories } from "@/lib/memories";

export default defineTool({
  description:
    "Search past published posts and brand guidelines using semantic similarity. Use this before drafting new content to reference high-performing posts and stay on-brand.",
  inputSchema: z.object({
    query: z.string().min(1).describe("What to look for, e.g. 'product launch posts that performed well' or 'our brand tone for technical content'."),
    limit: z.number().min(1).max(20).default(5).describe("Max results to return."),
    type: z.enum(["published_post", "brand_guideline"]).optional().describe("Filter to a specific memory type."),
  }),
  execute: async ({ query, limit, type }, ctx) => {
    const tenantId = ctx.session?.auth?.current?.attributes?.tenantId;

    if (!tenantId) {
      return { memories: [], message: "No workspace context available." };
    }

    try {
      const results = await searchMemories(tenantId as string, query, limit, type);
      return { memories: results, count: results.length };
    } catch (err: any) {
      console.warn("[search_memory] Tool error:", err?.message);
      return { memories: [], count: 0 };
    }
  },
  toModelOutput(output) {
    if (!output.memories || output.memories.length === 0) {
      return {
        type: "text",
        value: "No relevant past memories or guidelines found for this query.",
      };
    }
    const formatted = output.memories
      .map((m: any, i: number) => `[${i + 1}] (${m.type}) ${m.content}`)
      .join("\n\n");
    return {
      type: "text",
      value: `Found ${output.memories.length} relevant memories:\n\n${formatted}`,
    };
  },
});
