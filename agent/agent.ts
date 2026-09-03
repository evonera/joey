import { defineAgent, defineDynamic } from "eve";
import { resolveModelForTurn } from "@/lib/agent-model-resolver";

export default defineAgent({
  model: defineDynamic({
    events: {
      "step.started": async (_event, ctx) => {
        const preferredModel = (ctx.session.auth.current?.attributes?.preferredModel as string | undefined) || undefined;
        const tenantId = (ctx.session.auth.current?.attributes?.tenantId as string | undefined) || undefined;
        return await resolveModelForTurn({ preferredModel, tenantId });
      },
    },
  }),
  compaction: {
    thresholdPercent: 0.9,
  },
  limits: {
    maxInputTokensPerSession: 40_000_000,
  },
  build: {
    externalDependencies: ["@resvg/resvg-js"],
  },
});
