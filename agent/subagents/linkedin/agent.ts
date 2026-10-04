import { defineAgent, defineDynamic } from "eve";
import { resolveModelForTurn } from "@/lib/agent-model-resolver";
import { estimateTextCallCost } from "@/lib/ai-pricing";
import { eveUsageReservationId, reserveUsageBudget } from "@/lib/usage";

export default defineAgent({
  description: "Specialist agent for drafting professional and long-form LinkedIn posts.",
  model: defineDynamic({
    events: {
      "step.started": async (event, ctx) => {
        const step = event as { data: { turnId: string; stepIndex: number; sequence: number } };
        const preferredModel = (ctx.session.auth.current?.attributes?.preferredModel as string | undefined) || undefined;
        const tenantId = (ctx.session.auth.current?.attributes?.tenantId as string | undefined) || undefined;
        const resolved = await resolveModelForTurn({ preferredModel, tenantId });
        // Admission estimate only: Eve 0.50 modelOptions exposes providerOptions,
        // not a public per-call maxOutputTokens setting. Session limits remain separate.
        const maxOutputTokens = Number(process.env.AGENT_MAX_OUTPUT_TOKENS_PER_STEP || 8192);
        if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 100_000) throw new Error("AGENT_MAX_OUTPUT_TOKENS_PER_STEP must be between 1 and 100000.");
        if (tenantId) {
          await reserveUsageBudget({
            id: eveUsageReservationId({ tenantId, sessionId: ctx.session.id, ...step.data }),
            tenantId,
            kind: "text",
            modelId: resolved.providerModelId,
            estimatedCostUsd: estimateTextCallCost(resolved.providerModelId, ctx.messages, maxOutputTokens),
            metadata: { source: "eve_subagent", sessionId: ctx.session.id, ...step.data },
          });
        }
        return { model: resolved.model, modelContextWindowTokens: resolved.modelContextWindowTokens };
      },
    },
  }),
});
