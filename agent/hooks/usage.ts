import { defineHook } from "eve/hooks";
import { getModelCost } from "@/lib/models";
import { failUsageReservation, findLatestUsageReservation, settleUsageReservation } from "@/lib/usage";

async function reservationFor(event: { data: { turnId: string; stepIndex: number; sequence: number } }, ctx: { session: { id: string; auth: { current?: { attributes?: Record<string, unknown> } | null } } }) {
  const tenantId = ctx.session.auth.current?.attributes?.tenantId as string | undefined;
  if (!tenantId) return;
  const reservation = await findLatestUsageReservation({
    tenantId,
    metadata: { sessionId: ctx.session.id, turnId: event.data.turnId, stepIndex: event.data.stepIndex, sequence: event.data.sequence },
  });
  return { tenantId, reservation };
}

export default defineHook({
  events: {
    "step.completed": async (event, ctx) => {
      const usage = event.data.usage;
      const found = await reservationFor(event, ctx);
      if (!found?.reservation) return;
      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      await settleUsageReservation({
        id: found.reservation.id,
        inputTokens,
        outputTokens,
        actualCostUsd: usage?.costUsd ?? getModelCost(found.reservation.modelId || "", inputTokens, outputTokens),
        metadata: { providerReportedCost: usage?.costUsd !== undefined },
      });
    },
    "step.failed": async (event, ctx) => {
      const found = await reservationFor(event, ctx);
      if (found?.reservation) await failUsageReservation(found.reservation.id, { providerOutcome: "failed" });
    },
  },
});
