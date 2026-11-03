import { and, count, eq, gte, lt, lte, sql } from "drizzle-orm";
import { checkUsageLimits } from "@/lib/billing";
import { getScoutProviderSetup } from "@/lib/scouts/data-provider";
import { db } from "@/lib/db";
import { flowRuns, flowWebhookDeliveries, r2CleanupTasks, telegramOutbox, scouts, scoutEvaluations, mediaRenderJobs, drafts, posts, contentPackages, customAgentRuns, engagementItems } from "@/lib/db/schema";

export type OperationalHealth = {
  generatedAt: string;
  flowFailures24h: number;
  staleFlowRuns: number;
  webhookFailures24h: number;
  staleWebhookDeliveries: number;
  cleanupDue: number;
  cleanupRepeatedFailures: number;
  telegramPending: number;
  telegramUncertain: number;
  privateRepliesUncertain: number;
  scoutFailures24h: number;
  scoutUncertain: number;
  overdueScouts: number;
  blockedScouts: number;
  scoutReadinessUnchecked: number;
  renderFailures24h: number;
  stalledRenders: number;
  publicationFailures: number;
  pendingPublications: number;
  agencyFailures24h: number;
};

export async function getOperationalHealth(tenantId: string, now = new Date()): Promise<OperationalHealth> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const staleRunCutoff = new Date(now.getTime() - 30 * 60_000);
  const staleDeliveryCutoff = new Date(now.getTime() - 10 * 60_000);
  const staleWebhookRunCutoff = new Date(now.getTime() - 2 * 60_000);
  const oldOutboxCutoff = new Date(now.getTime() - 5 * 60_000);
  // Draft creation can precede approval by weeks. Only a valid claim or a
  // tenant-owned provider submission establishes when publishing started.
  // Missing legacy timing remains unknown rather than an invented overdue age.
  const draftPublicationStartedAt = sql`GREATEST(
    CASE WHEN ${drafts.errorMessage} ~ '^claimed:[0-9]{13}$'
      THEN to_timestamp(substring(${drafts.errorMessage} FROM 9)::double precision / 1000) AT TIME ZONE 'UTC'
      ELSE NULL END,
    (SELECT max(${posts.publishedAt}) FROM ${posts}
      WHERE ${posts.tenantId} = ${drafts.tenantId} AND ${posts.draftId} = ${drafts.id})
  )`;

  const [
    flowFailures24h,
    staleFlowRuns,
    webhookFailures24h,
    staleWebhookDeliveries,
    cleanupDue,
    cleanupRepeatedFailures,
    telegramPending,
    telegramUncertain,
    scoutFailures24h,
    scoutUncertain,
    overdueScouts,
    renderFailures24h,
    stalledRenders,
    draftFailures,
    packageFailures,
    pendingDrafts,
    pendingPackages,
    agencyFailures24h,
    activeScoutCount,
    activeScouts,
    privateRepliesUncertain,
  ] = await Promise.all([
    db.select({ value: count() }).from(flowRuns).where(and(eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "failed"), gte(flowRuns.updatedAt, dayAgo))),
    db.select({ value: count() }).from(flowRuns).where(and(eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running"), lt(flowRuns.updatedAt, staleRunCutoff))),
    db.select({ value: count() }).from(flowWebhookDeliveries).where(and(eq(flowWebhookDeliveries.tenantId, tenantId), eq(flowWebhookDeliveries.status, "failed"), gte(flowWebhookDeliveries.updatedAt, dayAgo))),
    db.select({ value: count() }).from(flowWebhookDeliveries).where(
      and(
        eq(flowWebhookDeliveries.tenantId, tenantId),
        eq(flowWebhookDeliveries.status, "processing"),
        lt(flowWebhookDeliveries.updatedAt, staleDeliveryCutoff),
        sql`NOT EXISTS (
          SELECT 1 FROM ${flowRuns}
          WHERE ${flowRuns.tenantId} = ${flowWebhookDeliveries.tenantId}
            AND ${flowRuns.flowId} = ${flowWebhookDeliveries.flowId}
            AND ${flowRuns.trigger} = 'webhook'
            AND ${flowRuns.triggerPayload}->>'webhookDeliveryId' = ${flowWebhookDeliveries.id}
            AND ${flowRuns.status} IN ('running', 'waiting_approval')
            AND ${flowRuns.updatedAt} >= ${staleWebhookRunCutoff.toISOString()}::timestamp
        )`,
      ),
    ),
    db.select({ value: count() }).from(r2CleanupTasks).where(and(eq(r2CleanupTasks.tenantId, tenantId), lte(r2CleanupTasks.nextAttemptAt, now))),
    db.select({ value: count() }).from(r2CleanupTasks).where(and(eq(r2CleanupTasks.tenantId, tenantId), gte(r2CleanupTasks.attempts, 3))),
    db.select({ value: count() }).from(telegramOutbox).where(
      and(
        eq(telegramOutbox.tenantId, tenantId),
        sql`${telegramOutbox.status} IN ('pending', 'sending')`,
        lt(telegramOutbox.updatedAt, oldOutboxCutoff),
      ),
    ),
    db.select({ value: count() }).from(telegramOutbox).where(and(eq(telegramOutbox.tenantId, tenantId), eq(telegramOutbox.status, "uncertain"))),
    db.select({ value: count() }).from(scoutEvaluations).where(and(eq(scoutEvaluations.tenantId, tenantId), eq(scoutEvaluations.status, "failed"), gte(scoutEvaluations.updatedAt, dayAgo))),
    db.select({ value: count() }).from(scoutEvaluations).where(and(eq(scoutEvaluations.tenantId, tenantId), eq(scoutEvaluations.status, "uncertain"))),
    db.select({ value: count() }).from(scouts).where(and(eq(scouts.tenantId, tenantId), eq(scouts.isActive, true),
      sql`COALESCE(${scouts.lastPolledAt}, ${scouts.createdAt}) + (${scouts.pollIntervalMinutes} + 15) * interval '1 minute' < ${now.toISOString()}::timestamp`)),
    db.select({ value: count() }).from(mediaRenderJobs).where(and(eq(mediaRenderJobs.tenantId, tenantId), eq(mediaRenderJobs.status, "failed"), gte(mediaRenderJobs.updatedAt, dayAgo))),
    db.select({ value: count() }).from(mediaRenderJobs).where(and(eq(mediaRenderJobs.tenantId, tenantId), sql`${mediaRenderJobs.status} IN ('queued', 'rendering')`, lt(mediaRenderJobs.updatedAt, staleRunCutoff))),
    db.select({ value: count() }).from(drafts).where(and(eq(drafts.tenantId, tenantId), eq(drafts.status, "failed"))),
    db.select({ value: count() }).from(contentPackages).where(and(eq(contentPackages.tenantId, tenantId), eq(contentPackages.status, "failed"))),
    // A provider-accepted/scheduled post remains pending until confirmed published.
    // Future scheduled work is expected; only overdue or immediate work needs review.
    db.select({ value: count() }).from(drafts).where(and(eq(drafts.tenantId, tenantId), eq(drafts.status, "publishing"), sql`${draftPublicationStartedAt} < ${staleRunCutoff.toISOString()}::timestamp`, sql`(${drafts.scheduledFor} IS NULL OR ${drafts.scheduledFor} < ${staleRunCutoff.toISOString()}::timestamp)`)),
    db.select({ value: count() }).from(contentPackages).where(and(eq(contentPackages.tenantId, tenantId), eq(contentPackages.status, "publishing"), sql`COALESCE(${contentPackages.scheduledFor}, ${contentPackages.updatedAt}) < ${staleRunCutoff.toISOString()}::timestamp`)),
    db.select({ value: count() }).from(customAgentRuns).where(and(eq(customAgentRuns.tenantId, tenantId), eq(customAgentRuns.status, "failed"), gte(customAgentRuns.updatedAt, dayAgo))),
    db.select({ value: count() }).from(scouts).where(and(eq(scouts.tenantId, tenantId), eq(scouts.isActive, true))),
    db.query.scouts.findMany({
      where: and(eq(scouts.tenantId, tenantId), eq(scouts.isActive, true)),
      orderBy: scouts.id,
      limit: 100,
    }),
    db.select({ value: count() }).from(engagementItems).where(and(eq(engagementItems.tenantId, tenantId), eq(engagementItems.dmDispatchStatus, "uncertain"))),
  ]);

  // Readiness-only scheduler backoff advances lastPolledAt. Independently
  // inspect the same paid/provider gates so that a recent scan cannot conceal
  // a blocked source. Bound both database work and provider resolution fan-out.
  let blockedScouts = 0;
  if (activeScouts.length) {
    const limits = await checkUsageLimits(tenantId);
    if (!limits.allowsAutonomousCadence) blockedScouts = activeScouts.length;
    else for (let offset = 0; offset < activeScouts.length; offset += 5) {
      const results = await Promise.all(activeScouts.slice(offset, offset + 5).map(source => getScoutProviderSetup(tenantId, source)));
      blockedScouts += results.filter(result => !result.ready).length;
    }
  }

  return {
    generatedAt: now.toISOString(),
    blockedScouts,
    scoutReadinessUnchecked: Math.max(0, Number(activeScoutCount[0]?.value ?? 0) - activeScouts.length),
    flowFailures24h: Number(flowFailures24h[0]?.value ?? 0),
    staleFlowRuns: Number(staleFlowRuns[0]?.value ?? 0),
    webhookFailures24h: Number(webhookFailures24h[0]?.value ?? 0),
    staleWebhookDeliveries: Number(staleWebhookDeliveries[0]?.value ?? 0),
    cleanupDue: Number(cleanupDue[0]?.value ?? 0),
    cleanupRepeatedFailures: Number(cleanupRepeatedFailures[0]?.value ?? 0),
    telegramPending: Number(telegramPending[0]?.value ?? 0),
    telegramUncertain: Number(telegramUncertain[0]?.value ?? 0),
    privateRepliesUncertain: Number(privateRepliesUncertain[0]?.value ?? 0),
    scoutFailures24h: Number(scoutFailures24h[0]?.value ?? 0),
    scoutUncertain: Number(scoutUncertain[0]?.value ?? 0),
    overdueScouts: Number(overdueScouts[0]?.value ?? 0),
    renderFailures24h: Number(renderFailures24h[0]?.value ?? 0),
    stalledRenders: Number(stalledRenders[0]?.value ?? 0),
    publicationFailures: Number(draftFailures[0]?.value ?? 0) + Number(packageFailures[0]?.value ?? 0),
    pendingPublications: Number(pendingDrafts[0]?.value ?? 0) + Number(pendingPackages[0]?.value ?? 0),
    agencyFailures24h: Number(agencyFailures24h[0]?.value ?? 0),
  };
}
