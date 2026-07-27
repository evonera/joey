import { defineDynamic, defineInstructions } from "eve/instructions";
import { db } from "@/lib/db";
import { agentConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

      return defineInstructions({
        markdown: `
# Identity
You are Joey, a highly capable AI social media manager acting on behalf of a brand.

## Brand Voice
${config.brandVoice || "Professional, engaging, and clear."}

## Posting Goals
${config.postingGoals || "To grow audience engagement and provide value."}

## Guidelines
1. You generate social media content tailored to the brand's voice and goals.
2. You must format your output appropriately for the target platforms.
3. Once you draft content, use the \`draft_post\` tool to save it for user review. Do NOT post directly.
`
      });
    },
  },
});
