import { db } from "@/lib/db";
import { contentPackages, themeSlots } from "@/lib/db/schema";
import { and, eq, desc, gt, sql } from "drizzle-orm";
import { getZernioClientForTenant } from "@/lib/publisher-core";
import { operationalEvent } from "@/lib/operations-log";

const SYNC_BATCH_LIMIT = 25;
const STALE_SYNC_HOURS = 24;
const SCHEDULER_PAGE_SIZE = 100;

interface ZernioPostAnalytics {
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  impressions?: number;
  follows?: number;
  engagementRate?: number;
  lastUpdated?: string;
}

interface SyncResult {
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}

/**
 * Map Zernio PostAnalytics to the PostEngagementMetrics shape used by the
 * quality scorer. Fields not provided by Zernio (unfollows) are left unset;
 * the scorer treats missing fields as 0.
 */
export function mapZernioToEngagementMetrics(
  analytics: ZernioPostAnalytics,
): {
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  impressions?: number;
  follows?: number;
} {
  return {
    reach: analytics.reach ?? 0,
    likes: analytics.likes ?? 0,
    comments: analytics.comments ?? 0,
    shares: analytics.shares ?? 0,
    saves: analytics.saves ?? 0,
    ...(analytics.impressions != null ? { impressions: analytics.impressions } : {}),
    ...(analytics.follows != null ? { follows: analytics.follows } : {}),
  };
}

function isStaleSync(metrics: Record<string, unknown>): boolean {
  const synced = metrics.analyticsSyncedAt;
  if (!synced) return true;
  const syncedAt = new Date(synced as string);
  if (Number.isNaN(syncedAt.getTime())) return true;
  return Date.now() - syncedAt.getTime() > STALE_SYNC_HOURS * 3_600_000;
}

function hasEngagementData(metrics: Record<string, unknown>): boolean {
  return (
    typeof metrics.reach === "number" ||
    typeof metrics.likes === "number" ||
    typeof metrics.comments === "number"
  );
}

/**
 * Fetch per-post analytics from Zernio and update contentPackages.metrics
 * with engagement data. Returns a summary for logging.
 */
export async function syncThemeStudioAnalytics(
  tenantId: string,
  limit = SYNC_BATCH_LIMIT,
): Promise<SyncResult> {
  // Query published packages that have a zernioPostId and may need analytics refresh.
  // Order by analyticsSyncedAt (nulls first = never synced first) to prioritize stale records.
  const candidates = await db.query.contentPackages.findMany({
    where: and(
      eq(contentPackages.tenantId, tenantId),
      eq(contentPackages.status, "published"),
    ),
    orderBy: [
      sql`(contentPackages.metrics->>'analyticsSyncedAt') IS NULL DESC`,
      sql`(contentPackages.metrics->>'analyticsSyncedAt') ASC NULLS FIRST`,
    ],
    limit: limit * 2,
  });

  const eligible = candidates.filter((pkg) => {
    const metrics = (pkg.metrics ?? {}) as Record<string, unknown>;
    if (typeof metrics.zernioPostId !== "string" || metrics.zernioPostId.length === 0) return false;
    if (hasEngagementData(metrics) && !isStaleSync(metrics)) return false;
    return true;
  }).slice(0, limit);

  if (eligible.length === 0) {
    return { processed: 0, updated: 0, skipped: candidates.length, errors: 0 };
  }

  let zernio;
  try {
    ({ zernio } = await getZernioClientForTenant(tenantId));
  } catch {
    return { processed: 0, updated: 0, skipped: candidates.length, errors: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const pkg of eligible) {
    const metrics = (pkg.metrics ?? {}) as Record<string, unknown>;
    const zernioPostId = metrics.zernioPostId as string;

    try {
      const response = await zernio.analytics.getAnalytics({
        query: { postId: zernioPostId },
      });

      const data = response.data as { analytics?: ZernioPostAnalytics } | undefined;
      if (!data?.analytics) {
        skipped++;
        continue;
      }

      const engagement = mapZernioToEngagementMetrics(data.analytics);
      const priorMetrics = { ...metrics };
      delete priorMetrics.reach;
      delete priorMetrics.likes;
      delete priorMetrics.comments;
      delete priorMetrics.shares;
      delete priorMetrics.saves;
      delete priorMetrics.impressions;
      delete priorMetrics.follows;

      await db
        .update(contentPackages)
        .set({
          metrics: {
            ...priorMetrics,
            ...engagement,
            analyticsSyncedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contentPackages.id, pkg.id),
            eq(contentPackages.tenantId, tenantId),
          ),
        );
      updated++;
    } catch {
      errors++;
    }
  }

  return { processed: eligible.length, updated, skipped, errors };
}

async function fetchActiveSlotTenants(cursor: Date | null): Promise<Array<{ tenantId: string; createdAt: Date }>> {
  return db.query.themeSlots.findMany({
    columns: { tenantId: true, createdAt: true },
    where: cursor
      ? and(eq(themeSlots.isActive, true), gt(themeSlots.createdAt, cursor))
      : eq(themeSlots.isActive, true),
    orderBy: [themeSlots.createdAt],
    limit: SCHEDULER_PAGE_SIZE,
  });
}

/**
 * Process analytics sync for all active theme pages across the tenant.
 * Called from the 1-minute tick.
 * Uses cursor-based pagination to cover all active slots.
 */
export async function processThemeStudioAnalyticsSync(limit = SYNC_BATCH_LIMIT): Promise<void> {
  const seen = new Set<string>();
  let cursor: Date | null = null;

  for (;;) {
    const slots = await fetchActiveSlotTenants(cursor);
    if (slots.length === 0) break;

    for (const { tenantId } of slots) {
      if (seen.has(tenantId)) continue;
      seen.add(tenantId);

      try {
        const result = await syncThemeStudioAnalytics(tenantId, limit);
        if (result.updated > 0) {
          operationalEvent("info", "theme_studio.analytics_synced", {
            tenantId,
            ...result,
          });
        }
      } catch (err) {
        operationalEvent("error", "theme_studio.analytics_sync_failed", {
          tenantId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    cursor = slots[slots.length - 1].createdAt;
    if (slots.length < SCHEDULER_PAGE_SIZE) break;
  }
}
