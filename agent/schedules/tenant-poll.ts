import { defineSchedule } from "eve/schedules";
import eveChannel from "../channels/eve";
import { db } from "@/lib/db";
import { agentConfigs, tenants, drafts, webhookEvents } from "@/lib/db/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { executePublishDraft, getZernioClientForTenant } from "@/app/actions/publisher";

export default defineSchedule({
  cron: "*/5 * * * *",
  async run({ receive, waitUntil }) {

    // --- 0. Process Pending Webhook Events ---
    const pendingEvents = await db.query.webhookEvents.findMany({
      where: and(
        eq(webhookEvents.status, "pending"),
        isNotNull(webhookEvents.tenantId)
      ),
      limit: 20,
    });

    for (const event of pendingEvents) {
      const payload = event.payload as any;
      const resolvedTenantId = event.tenantId!;
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, resolvedTenantId),
      });
      if (!tenant) {
        await db.update(webhookEvents)
          .set({ status: "failed", errorMessage: "Tenant not found" })
          .where(eq(webhookEvents.id, event.id));
        continue;
      }

      let agentMessage = "";
      switch (event.eventType) {
        case "comment.received":
          agentMessage = `A new comment was received on a post: "${payload.comment?.text ?? "(no text)"}". Review the comment and draft an appropriate response.`;
          break;
        case "message.received":
          agentMessage = "A new direct message was received. Review the conversation and draft a response if needed.";
          break;
        case "post.failed":
          agentMessage = "A post failed to publish. Review the error and determine if any action is needed.";
          break;
        case "post.partial":
          agentMessage = "A post was only partially published across platforms. Check which platforms succeeded and which failed.";
          break;
        default:
          continue;
      }

      if (agentMessage) {
        waitUntil(
          receive(eveChannel, {
            message: agentMessage,
            target: {},
            auth: {
              authenticator: "cron",
              principalType: "user",
              principalId: tenant.ownerId,
              attributes: { tenantId: resolvedTenantId },
            },
          })
        );
      }

      await db.update(webhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(webhookEvents.id, event.id));
    }

    // --- 1. Publish Scheduled Drafts ---
    const pendingDrafts = await db.select({
      id: drafts.id,
      tenantId: drafts.tenantId
    })
    .from(drafts)
    .where(
        and(
            eq(drafts.status, "approved"),
            isNotNull(drafts.scheduledFor),
            lte(drafts.scheduledFor, new Date())
        )
    );

    for (const draft of pendingDrafts) {
      try {
        const { zernio } = await getZernioClientForTenant(draft.tenantId);
        // Fire and forget (or await it depending on how many we expect)
        // We await to avoid throttling the DB/Zernio connection pool if there are hundreds
        await executePublishDraft(draft.id, draft.tenantId, zernio);
      } catch (error) {
        console.error(`Failed to publish scheduled draft ${draft.id} for tenant ${draft.tenantId}:`, error);
      }
    }


    // --- 2. Trigger AI Drafting ---
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
