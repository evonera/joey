import { defineSchedule } from "eve/schedules";
import eveChannel from "../channels/eve";
import { db } from "@/lib/db";
import { agentConfigs, tenants, member, drafts, webhookEvents, engagementItems, replyDrafts, socialAccounts } from "@/lib/db/schema";
import { eq, and, lte, isNotNull, isNull, asc, inArray } from "drizzle-orm";
import { executePublishDraft, getZernioClientForTenant, publishDueDrafts } from "@/lib/publisher-core";
import { syncTenantMemories } from "@/lib/ingest-memories";
import { assertBudget } from "@/lib/usage";
import { recoverStaleEngagementSends } from "@/lib/engagement-delivery";
// NOTE: Theme Studio DM retries are owned by flows-tick (every minute).
// Do not call processThemeStudioDmRetries here to avoid a duplicate pump.
// Aliases: toZonedTime() = UTC -> local wall-clock; fromZonedTime() = local -> UTC.
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const DAY_INDEX: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
};

interface PostingSchedule {
  timezone?: string;
  times?: string[];
  activeDays?: string[];
}

function parseTime(t: string): { hours: number; minutes: number } {
  const [hours, minutes] = t.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

/**
 * Computes the next future drafting time (as an absolute UTC Date) honouring the
 * tenant's configured timezone and active days. If the schedule has no times or
 * activeDays, it defaults to a 24-hour poke so polling keeps working.
 */
function nextDraftAt(now: Date, schedule?: PostingSchedule | null): Date {
  const timezone = schedule?.timezone || "UTC";
  const times = (schedule?.times || []).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
  const activeDays = schedule?.activeDays || [];

  if (times.length === 0) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  const nowZoned = toZonedTime(now, timezone);

  // Scan up to 14 days forward for the next valid slot.
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const day = new Date(nowZoned.getFullYear(), nowZoned.getMonth(), nowZoned.getDate() + dayOffset);
    const dow = day.getDay();
    if (activeDays.length > 0 && !activeDays.includes(Object.keys(DAY_INDEX).find((k) => DAY_INDEX[k] === dow) as string)) {
      continue;
    }
    const sorted = [...times].sort();
    for (const t of sorted) {
      const { hours, minutes } = parseTime(t);
      const candidateLocal = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
      // Candidate must be strictly in the future in the tenant's local time.
      if (candidateLocal.getTime() > nowZoned.getTime()) {
        return fromZonedTime(candidateLocal, timezone);
      }
    }
  }

  // Fallback: 24h rolling cadence.
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

export default defineSchedule({
  cron: "0 4 * * *",
  async run({ to, waitUntil }) {

    // Release reply-send leases abandoned by crashed workers or transient
    // database failures before admitting more engagement work.
    try {
      await recoverStaleEngagementSends();
    } catch (err) {
      console.error("[poll] Failed to recover stale engagement sends:", err);
    }

    // --- 0. Sync Memories for Active Tenants ---
    const activeTenants = await db.select({ id: agentConfigs.tenantId })
      .from(agentConfigs)
      .where(eq(agentConfigs.isPaused, false));
    for (const t of activeTenants) {
      try {
        await syncTenantMemories(t.id);
      } catch (err) {
        console.error(`[memory-sync] Failed to sync memories for tenant ${t.id}:`, err);
      }
    }

    // --- 1. Process Pending Engagement Items (Phase 2.7) ---
    const pendingItems = await db.select({
      id: engagementItems.id,
      tenantId: engagementItems.tenantId,
      platform: engagementItems.platform,
      text: engagementItems.text,
      commenterName: engagementItems.commenterName,
      commenterHandle: engagementItems.commenterHandle,
      platformPostId: engagementItems.platformPostId,
    })
    .from(engagementItems)
    .leftJoin(replyDrafts, and(
      eq(replyDrafts.engagementItemId, engagementItems.id),
      inArray(replyDrafts.status, ["pending_review", "approved", "sent"])
    ))
    .where(
      and(
        eq(engagementItems.status, "pending"),
        isNull(replyDrafts.id)
      )
    )
    .orderBy(asc(engagementItems.createdAt))
    .limit(20);

    for (const item of pendingItems) {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, item.tenantId),
      });
      const ownerMember = await db.query.member.findFirst({
        where: and(eq(member.organizationId, item.tenantId), eq(member.role, "owner"))
      });
      if (!ownerMember) continue;
      if (!tenant) continue;

      const agentConfig = await db.query.agentConfigs.findFirst({
        where: eq(agentConfigs.tenantId, item.tenantId),
      });

      waitUntil(
        to(eveChannel, {}).send(
          `A new comment was received on ${item.platform}. Comment by @${item.commenterHandle || item.commenterName || "unknown"}: "${item.text}". Use the reply_to_comment tool to draft an on-brand response. The engagement item ID is: ${item.id}. ${agentConfig?.brandVoice ? `Brand voice: ${agentConfig.brandVoice}` : ""}`,
          {
            auth: {
              authenticator: "cron",
              principalType: "user",
              principalId: ownerMember.userId,
              attributes: { tenantId: item.tenantId },
            },
          },
        ),
      );
    }

    // --- 2. Process Pending Webhook Events (legacy) ---
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
      const ownerMember = await db.query.member.findFirst({
        where: and(eq(member.organizationId, resolvedTenantId), eq(member.role, "owner"))
      });
      if (!ownerMember) {
        await db.update(webhookEvents)
          .set({ status: "failed", errorMessage: "Organization has no owner member" })
          .where(eq(webhookEvents.id, event.id));
        continue;
      }
      if (!tenant) {
        await db.update(webhookEvents)
          .set({ status: "failed", errorMessage: "Tenant not found" })
          .where(eq(webhookEvents.id, event.id));
        continue;
      }

      // Skip comment.received — now handled by engagement items above
      if (event.eventType === "comment.received") {
        await db.update(webhookEvents)
          .set({ status: "processed", processedAt: new Date() })
          .where(eq(webhookEvents.id, event.id));
        continue;
      }

      let agentMessage = "";
      switch (event.eventType) {
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
          to(eveChannel, {}).send(agentMessage, {
            auth: {
              authenticator: "cron",
              principalType: "user",
              principalId: ownerMember.userId,
              attributes: { tenantId: resolvedTenantId },
            },
          }),
        );
      }

      await db.update(webhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(webhookEvents.id, event.id));
    }

    // --- 2. Publish Scheduled Drafts ---
    await publishDueDrafts();


    // --- 3. Trigger AI Drafting ---
    const dueConfigs = await db.select({
        tenantId: agentConfigs.tenantId,
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
      try {
      const ownerMember = await db.query.member.findFirst({
        where: and(eq(member.organizationId, config.tenantId), eq(member.role, "owner"))
      });
      if (!ownerMember) continue;

      // Enforce the monthly LLM budget before spawning an expensive drafting run.
      // Fail-safe: if the check itself errors, SKIP rather than spend unbounded.
      try {
        const budget = await assertBudget(config.tenantId);
        if (!budget.allowed) {
          console.log(`[budget] Tenant ${config.tenantId} over budget; skipping draft.`);
          continue;
        }
      } catch (err) {
        console.error(`[budget] Budget check failed for ${config.tenantId}; skipping draft:`, err);
        continue;
      }

      // Spawn an agent task for this tenant
      waitUntil(
        to(eveChannel, {}).send(
          "It is time to draft a new social media post. Please review the brand persona and goals, generate a relevant draft, and use the draft_post tool to save it.",
          {
            auth: {
              authenticator: "cron",
              principalType: "user",
              principalId: ownerMember.userId,
              attributes: { tenantId: config.tenantId },
            },
          },
        ),
      );

      // Compute the next drafting slot honouring the tenant's configured
      // timezone and active days. Strictly future by construction, so the due
      // check fires exactly once per slot.
      const schedule = config.postingSchedule as PostingSchedule | null;
      const nextDueDate = nextDraftAt(new Date(), schedule);

      await db.update(agentConfigs)
        .set({ nextDraftAt: nextDueDate })
        .where(eq(agentConfigs.tenantId, config.tenantId));
      } catch (tenantErr) {
        // One malformed schedule (e.g. invalid IANA timezone) must not abort
        // the shared poll for every other tenant.
        console.error(`[poll] Tenant ${config.tenantId} processing failed:`, tenantErr);
        continue;
      }
    }
  },
});
