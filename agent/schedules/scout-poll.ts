import { defineSchedule } from "eve/schedules";
import eveChannel from "../channels/eve";
import { db } from "@/lib/db";
import { scouts, member, notifications } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { evaluateScout, type ScoutAlert } from "@/lib/scouts/evaluator";

export interface ScoutsTickOptions {
  dispatchAlert?: (params: {
    scout: typeof scouts.$inferSelect;
    alert: ScoutAlert;
    ownerUserId: string;
  }) => Promise<void> | void;
}

export async function runScoutsTick(options?: ScoutsTickOptions) {
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

        // 1. Persist in-app notification
        try {
          await db.insert(notifications).values({
            tenantId: scout.tenantId,
            type: "scout_alert",
            title: evaluation.alert.title,
            body: `Competitor change detected for ${scout.name}: ${evaluation.alert.changes.map((c) => c.label).join(", ")}`,
            link: "/scouts",
            metadata: evaluation.alert,
          });
        } catch (notifErr) {
          console.error(`[scout-poll] Failed creating in-app notification:`, notifErr);
        }

        // 2. Dispatch to channel if callback provided
        if (ownerMember && options?.dispatchAlert) {
          try {
            await options.dispatchAlert({
              scout,
              alert: evaluation.alert,
              ownerUserId: ownerMember.userId,
            });
          } catch (dispatchErr) {
            console.error(`[scout-poll] Failed dispatching scout alert:`, dispatchErr);
          }
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
  cron: "*/15 * * * *",
  async run({ to, waitUntil }) {
    await runScoutsTick({
      dispatchAlert: ({ scout, alert, ownerUserId }) => {
        const summaryChanges = alert.changes
          .slice(0, 3)
          .map((c) => `• **${c.label}**: ${c.after} (${c.rationale})`)
          .join("\n");
        waitUntil(
          to(eveChannel, {}).send(
            `🚨 **Social Scout Alert: ${alert.title}**\n\n` +
              `Target: ${scout.targetUrl} (${scout.platform})\n` +
              `Goal: ${scout.goalCondition}\n\n` +
              `**Key observations:**\n${summaryChanges}\n\n` +
              `👉 View details or generate a remix response at /scouts`,
            {
              auth: {
                authenticator: "cron",
                principalType: "user",
                principalId: ownerUserId,
                attributes: { tenantId: scout.tenantId },
              },
            }
          )
        );
      },
    });
  },
});

