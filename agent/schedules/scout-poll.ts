import { defineSchedule } from "eve/schedules";
import eveChannel from "../channels/eve";
import { db } from "@/lib/db";
import { scouts, member } from "@/lib/db/schema";
import { eq, and, or, isNull, lte } from "drizzle-orm";
import { evaluateScout } from "@/lib/scouts/evaluator";

export async function runScoutsTick() {
  const now = new Date();

  // Find active scouts that are due for polling
  const activeScouts = await db.query.scouts.findMany({
    where: eq(scouts.isActive, true),
  });

  const dueScouts = activeScouts.filter((scout) => {
    if (!scout.lastPolledAt) return true;
    const nextDue = new Date(scout.lastPolledAt.getTime() + scout.pollIntervalMinutes * 60 * 1000);
    return nextDue <= now;
  });

  const results: Array<{ scoutId: string; triggered: boolean; error?: string }> = [];

  for (const scout of dueScouts) {
    try {
      const evaluation = await evaluateScout(scout.id);
      results.push({ scoutId: scout.id, triggered: evaluation.triggered, error: evaluation.error });

      if (evaluation.triggered && evaluation.alert) {
        // Find owner member to notify
        const ownerMember = await db.query.member.findFirst({
          where: and(eq(member.organizationId, scout.tenantId), eq(member.role, "owner")),
        });

        if (ownerMember) {
          console.log(`[scout-poll] Alert triggered for scout ${scout.name} (${scout.id})`);
        }
      }
    } catch (err) {
      console.error(`[scout-poll] Failed evaluating scout ${scout.id}:`, err);
      results.push({ scoutId: scout.id, triggered: false, error: String(err) });
    }
  }

  return { checkedCount: dueScouts.length, results };
}

export default defineSchedule({
  cron: "0 5 * * *",
  async run({ to, waitUntil }) {
    const tickResult = await runScoutsTick();

    // Notify channel for any triggered alert
    const triggered = tickResult.results.filter((r) => r.triggered);
    if (triggered.length > 0) {
      console.log(`[scout-poll] ${triggered.length} scouts triggered alerts.`);
    }
  },
});
