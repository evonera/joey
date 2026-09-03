import { defineSchedule } from "eve/schedules";
import eveChannel from "../channels/eve";
import { db } from "@/lib/db";
import { agentConfigs, tenants, member, drafts, webhookEvents } from "@/lib/db/schema";
import { eq, and, or, lte, isNull, inArray } from "drizzle-orm";
import {
  claimEngagementDispatches,
  claimWebhookDispatches,
  recoverStaleEngagementDispatches,
  recoverStaleWebhookDispatches,
  releaseEngagementDispatch,
  truncateForDispatch,
} from "@/lib/dispatch-claim";
import { recordAutomationRun } from "@/lib/automation-runs";
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
    // Recover-then-claim: rows stranded as `dispatching` by a crashed or
    // overlapping tick become eligible again first; the single-statement CTE
    // claim (FOR UPDATE SKIP LOCKED) then guarantees only one worker wins
    // each row, so overlapping polls can no longer double-dispatch the same
    // comment to the agent.
    await recoverStaleEngagementDispatches();
    const pendingItems = await claimEngagementDispatches(20);

    // Batch tenant/owner/config lookups (was one N+1 round-trip per item).
    const engagementTenantIds = [...new Set(pendingItems.map((item) => item.tenantId))];
    const [engagementTenants, engagementOwners, engagementConfigs] = engagementTenantIds.length > 0
      ? await Promise.all([
          db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.id, engagementTenantIds)),
          db.select({ organizationId: member.organizationId, userId: member.userId })
            .from(member)
            .where(and(inArray(member.organizationId, engagementTenantIds), eq(member.role, "owner"))),
          db.select({ tenantId: agentConfigs.tenantId, brandVoice: agentConfigs.brandVoice })
            .from(agentConfigs)
            .where(inArray(agentConfigs.tenantId, engagementTenantIds)),
        ])
      : [[], [], []];
    const knownTenantIds = new Set(engagementTenants.map((row) => row.id));
    const ownerByTenant = new Map(engagementOwners.map((row) => [row.organizationId, row.userId]));
    const brandVoiceByTenant = new Map(engagementConfigs.map((row) => [row.tenantId, row.brandVoice]));

    for (const item of pendingItems) {
      if (!knownTenantIds.has(item.tenantId)) {
        await releaseEngagementDispatch(item.id);
        continue;
      }
      const ownerUserId = ownerByTenant.get(item.tenantId);
      if (!ownerUserId) {
        await releaseEngagementDispatch(item.id);
        continue;
      }

      const brandVoice = brandVoiceByTenant.get(item.tenantId);
      waitUntil(
        to(eveChannel, {}).send(
          `A new comment was received on ${item.platform}. Comment by @${item.commenterHandle || item.commenterName || "unknown"}: "${truncateForDispatch(item.text)}". Use the reply_to_comment tool to draft an on-brand response. The engagement item ID is: ${item.id}. ${brandVoice ? `Brand voice: ${brandVoice}` : ""}`,
          {
            auth: {
              authenticator: "cron",
              principalType: "user",
              principalId: ownerUserId,
              attributes: { tenantId: item.tenantId },
            },
          },
        ),
      );
      await recordAutomationRun({
        kind: "engagement_dispatch",
        automationId: item.id,
        tenantId: item.tenantId,
        status: "ok",
      });
      // Left as `dispatching` on purpose: the lease plus next-tick recovery
      // re-admit the item only if reply_to_comment never creates a draft
      // (which would exclude it from future claims via the draft join).
    }

    // --- 2. Process Pending Webhook Events (legacy) ---
    await recoverStaleWebhookDispatches();
    const pendingEvents = await claimWebhookDispatches(20);

    const webhookTenantIds = [...new Set(pendingEvents.map((event) => event.tenantId))];
    const [webhookTenants, webhookOwners] = webhookTenantIds.length > 0
      ? await Promise.all([
          db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.id, webhookTenantIds)),
          db.select({ organizationId: member.organizationId, userId: member.userId })
            .from(member)
            .where(and(inArray(member.organizationId, webhookTenantIds), eq(member.role, "owner"))),
        ])
      : [[], []];
    const knownWebhookTenants = new Set(webhookTenants.map((row) => row.id));
    const webhookOwnerByTenant = new Map(webhookOwners.map((row) => [row.organizationId, row.userId]));

    for (const event of pendingEvents) {
      const resolvedTenantId = event.tenantId;
      const terminal = (values: { status: string; processedAt?: Date; errorMessage?: string | null }) =>
        db.update(webhookEvents).set(values).where(
          and(eq(webhookEvents.id, event.id), eq(webhookEvents.tenantId, resolvedTenantId)),
        );
      const ownerUserId = webhookOwnerByTenant.get(resolvedTenantId);
      if (!ownerUserId) {
        await terminal({ status: "failed", errorMessage: "Organization has no owner member" });
        await recordAutomationRun({
          kind: "webhook_dispatch",
          automationId: event.id,
          tenantId: resolvedTenantId,
          status: "error",
          error: "Organization has no owner member",
        });
        continue;
      }
      if (!knownWebhookTenants.has(resolvedTenantId)) {
        await terminal({ status: "failed", errorMessage: "Tenant not found" });
        await recordAutomationRun({
          kind: "webhook_dispatch",
          automationId: event.id,
          tenantId: resolvedTenantId,
          status: "error",
          error: "Tenant not found",
        });
        continue;
      }

      // Skip comment.received — now handled by engagement items above
      if (event.eventType === "comment.received") {
        await terminal({ status: "processed", processedAt: new Date() });
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
          // Unknown types must reach a terminal state: re-fetching the same
          // `pending` rows every tick starved the whole queue.
          await terminal({
            status: "ignored",
            processedAt: new Date(),
            errorMessage: `Unsupported event type: ${event.eventType}`,
          });
          await recordAutomationRun({
            kind: "webhook_dispatch",
            automationId: event.id,
            tenantId: resolvedTenantId,
            status: "ok",
            error: `Unsupported event type: ${event.eventType}`,
          });
          continue;
      }

      if (agentMessage) {
        waitUntil(
          to(eveChannel, {}).send(agentMessage, {
            auth: {
              authenticator: "cron",
              principalType: "user",
              principalId: ownerUserId,
              attributes: { tenantId: resolvedTenantId },
            },
          }),
        );
      }

      await terminal({ status: "processed", processedAt: new Date() });
      await recordAutomationRun({
        kind: "webhook_dispatch",
        automationId: event.id,
        tenantId: resolvedTenantId,
        status: "ok",
      });
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
            or(
                isNull(agentConfigs.nextDraftAt),
                lte(agentConfigs.nextDraftAt, new Date())
            )
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
