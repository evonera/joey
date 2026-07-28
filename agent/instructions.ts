import { defineDynamic, defineInstructions } from "eve/instructions";
import { db } from "@/lib/db";
import { agentConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { searchMemories } from "@/lib/memories";

export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const tenantId = ctx.session.auth.current?.attributes?.tenantId;
      
      if (!tenantId) {
        return defineInstructions({
          markdown: `
# Identity
You are an AI social media manager.
Your task is to manage content creation, but no specific tenant context was provided.
`
        });
      }

      const config = await db.query.agentConfigs.findFirst({
        where: eq(agentConfigs.tenantId, tenantId as string)
      });

      if (!config) {
        return defineInstructions({
          markdown: `
# Identity
You are an AI social media manager.
Please wait for the user to configure their Persona and Schedule.
`
        });
      }

      let memoryBlock = "";
      try {
        const brandMemories = await searchMemories(tenantId as string, "brand voice and posting guidelines", 3, "brand_guideline");
        const topPosts = await searchMemories(tenantId as string, "high performing posts", 3, "published_post");
        if (brandMemories.length > 0 || topPosts.length > 0) {
          memoryBlock = "\n## Relevant Memories\n";
          if (brandMemories.length > 0) {
            memoryBlock += "\n### Brand Guidelines\n";
            for (const m of brandMemories) {
              memoryBlock += `- ${m.content}\n`;
            }
          }
          if (topPosts.length > 0) {
            memoryBlock += "\n### Top Past Posts (similar to current context)\n";
            for (const m of topPosts) {
              memoryBlock += `- "${m.content}" (relevance: ${(m.similarity * 100).toFixed(0)}%)\n`;
            }
          }
        }
      } catch {
        memoryBlock = "";
      }

      return defineInstructions({
        markdown: `
# Identity
You are Joey, a highly capable AI social media manager acting on behalf of a brand.

## Brand Voice
${config.brandVoice || "Professional, engaging, and clear."}

## Posting Goals
${config.postingGoals || "To grow audience engagement and provide value."}${memoryBlock}

## Composio Integrations
You have access to Composio, a gateway to 1000+ connected apps (News, Search, Gmail, Google Calendar, Notion, Slack, GitHub, and more).
- Use \`connection_search\` to discover available tools from connected apps.
- When the user asks for news-driven content, trending topics, or industry research, load the \`curate-content\` skill using \`load_skill\` and follow its workflow.
- Composio tools are available for the current task — search for what you need.

## Guidelines
1. You generate social media content tailored to the brand's voice and goals.
2. You must format your output appropriately for the target platforms.
3. Before drafting, use \`search_memory\` to find relevant past posts and brand guidelines so your content builds on what has worked before.
4. Once you draft content, use the \`draft_post\` tool to save it for user review. Do NOT post directly.
`
      });
    },
  },
});
