import { defineHook } from "eve/hooks";
import { getModelCost } from "@/lib/models";
import { eveUsageReservationId, failUsageReservation, getUsageReservation, settleUsageReservation } from "@/lib/usage";

async function reservationFor(event: { data: { turnId: string; stepIndex: number; sequence: number } }, ctx: { session: { id: string; auth: { current?: { attributes?: Record<string, unknown> } | null } } }) {
  const tenantId = ctx.session.auth.current?.attributes?.tenantId as string | undefined;
  if (!tenantId) return;
  return { tenantId, reservationId: eveUsageReservationId({ tenantId, sessionId: ctx.session.id, ...event.data }) };
}

export default defineHook({
  events: {
    "step.completed": async (event, ctx) => {
      const usage = event.data.usage;
      const found = await reservationFor(event, ctx);
      if (!found) return;
      const reservation = await getUsageReservation(found.reservationId);
      if (!reservation || reservation.status !== "reserved") return;
      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      await settleUsageReservation({
        id: found.reservationId,
        inputTokens,
        outputTokens,
        actualCostUsd: usage?.costUsd ?? getModelCost(reservation.modelId || "", inputTokens, outputTokens),
        metadata: { providerReportedCost: usage?.costUsd !== undefined },
      });
    },
    "step.failed": async (event, ctx) => {
      const found = await reservationFor(event, ctx);
      if (found) await failUsageReservation(found.reservationId, { providerOutcome: "failed" });
    },
  },
});
