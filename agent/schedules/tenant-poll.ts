import { defineSchedule } from "eve/schedules";
import eveChannel from "../channels/eve";
import { db } from "@/lib/db";
import { agentConfigs, tenants } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";

export default defineSchedule({
  cron: "*/5 * * * *",
  async run({ receive, waitUntil }) {
    const dueConfigs = await db.select({
        tenantId: agentConfigs.tenantId,
        ownerId: tenants.ownerId,
        postingSchedule: agentConfigs.postingSchedule,
    })
    .from(agentConfigs)
    .innerJoin(tenants, eq(tenants.id, agentConfigs.tenantId))
    .where(
        and(
            eq(agentConfigs.isPaused, false),
            lte(agentConfigs.nextDraftAt, new Date())
        )
    );

    for (const config of dueConfigs) {
      // Spawn an agent task for this tenant
      waitUntil(
        receive(eveChannel, {
          message: "It is time to draft a new social media post. Please review the brand persona and goals, generate a relevant draft, and use the draft_post tool to save it.",
          target: { }, // Base target, Eve handles session isolation via auth
          auth: {
            authenticator: "cron",
            principalType: "user",
            principalId: config.ownerId,
            attributes: { tenantId: config.tenantId },
          },
        })
      );

      // Robust implementation: Parse postingSchedule to find next time
      const nextDate = new Date();
      try {
        const schedule = config.postingSchedule as any;
        if (schedule && Array.isArray(schedule.times) && schedule.times.length > 0) {
            // Naive fallback: schedule for tomorrow at the configured time (UTC).
            // TODO: honour schedule.timezone for accurate local-time scheduling.
            const [hours, minutes] = schedule.times[0].split(':').map(Number);
            nextDate.setUTCDate(nextDate.getUTCDate() + 1);
            nextDate.setUTCHours(hours, minutes, 0, 0);
        } else {
            nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        }
      } catch (e) {
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      }

      await db.update(agentConfigs)
        .set({ nextDraftAt: nextDate })
        .where(eq(agentConfigs.tenantId, config.tenantId));
    }
  },
});
