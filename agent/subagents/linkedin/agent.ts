import { defineAgent, defineDynamic } from "eve";
import { resolveModelForTurn } from "@/lib/agent-model-resolver";

export default defineAgent({
  description: "Specialist agent for drafting professional and long-form LinkedIn posts.",
  model: defineDynamic({
    events: {
      "step.started": async (_event, ctx) => {
        const preferredModel = (ctx.session.auth.current?.attributes?.preferredModel as string | undefined) || undefined;
        const tenantId = (ctx.session.auth.current?.attributes?.tenantId as string | undefined) || undefined;
        return await resolveModelForTurn({ preferredModel, tenantId });
      },
    },
  }),
});
