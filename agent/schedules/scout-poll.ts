import { defineSchedule } from "eve/schedules";
import eveChannel from "../channels/eve";
import { runScoutsTick } from "@/lib/scouts/evaluator";

/**
 * Scout poll schedule.
 *
 * Cadence note: the Eve schedule cron MUST stay Hobby-safe (once per day or less —
 * Vercel rejects more frequent crons on Hobby at deploy time). Sub-day
 * `pollIntervalMinutes` (15m to 360m) are serviced by `/api/cron` which
 * runs runScoutsTick() on every invocation.
 */
export default defineSchedule({
  cron: "0 5 * * *",
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

