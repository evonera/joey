import { defineAgent, defineDynamic } from "eve";
import { resolveModelForTurn } from "@/lib/agent-model-resolver";
import { estimateTextCallCost } from "@/lib/ai-pricing";
import { getModelById } from "@/lib/models";
import { deterministicUsageReservationId, reserveUsageBudget } from "@/lib/usage";

export default defineAgent({
  model: defineDynamic({
    events: {
      "step.started": async (event, ctx) => {
        const step = event as { data: { turnId: string; stepIndex: number; sequence: number } };
        const preferredModel = (ctx.session.auth.current?.attributes?.preferredModel as string | undefined) || undefined;
        const tenantId = (ctx.session.auth.current?.attributes?.tenantId as string | undefined) || undefined;
        const resolved = await resolveModelForTurn({ preferredModel, tenantId });
        if (tenantId) {
          const model = getModelById(preferredModel);
          const maxOutputTokens = Number(process.env.AGENT_MAX_OUTPUT_TOKENS_PER_STEP || 8192);
          if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 100_000) {
            throw new Error("AGENT_MAX_OUTPUT_TOKENS_PER_STEP must be between 1 and 100000.");
          }
          await reserveUsageBudget({
            id: deterministicUsageReservationId(["eve", tenantId, ctx.session.id, step.data.turnId, step.data.stepIndex, step.data.sequence]),
            tenantId,
            kind: "text",
            modelId: model.providerModelId,
            estimatedCostUsd: estimateTextCallCost(model.providerModelId, ctx.messages, maxOutputTokens),
            metadata: {
              source: "eve",
              sessionId: ctx.session.id,
              turnId: step.data.turnId,
              stepIndex: step.data.stepIndex,
              sequence: step.data.sequence,
            },
          });
        }
        return resolved;
      },
    },
  }),
  compaction: {
    thresholdPercent: 0.9,
  },
  limits: {
    maxInputTokensPerSession: 1_000_000,
    maxOutputTokensPerSession: 100_000,
  },
  build: {
    externalDependencies: ["@resvg/resvg-js"],
  },
});
