"use server";

import { getActiveTenantId } from "@/lib/auth";
import { getZernioClientForTenant } from "@/lib/publisher-core";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchZernioAnalyticsPages } from "@/lib/zernio-analytics";

import { aggregateMetrics, engagementRate, publishedTimestamp, type AnalyticsMetrics as Metrics, type MetricTotals } from "@/lib/analytics-metrics";

interface PlatformMeta {
  platform: string;
  analytics: Metrics | null;
}

interface PostRow {
  id: string;
  content?: string;
  publishedAt?: string;
  platforms: PlatformMeta[];
}

type SeriesPoint = MetricTotals & { label: string };

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "X",
  threads: "Threads",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  reddit: "Reddit",
  tiktok: "TikTok",
  bluesky: "Bluesky",
  telegram: "Telegram",
};

export interface AnalyticsSnapshot {
  success: true;
  summary: {
    totalPosts: number;
    impressions: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    views: number | null;
    engagementRate: number | null;
    lastSync?: string | null;
    pagesFetched: number;
    truncated: boolean;
  };
  byPlatform: (MetricTotals & { platform: string; label: string })[];
  posts: PostRow[];
  series: SeriesPoint[];
}

export type AnalyticsResult = AnalyticsSnapshot | { success: false; error: string; code?: "no_connected_account" };

export async function getAnalytics(days = 30): Promise<AnalyticsResult> {
  try {
    const tenantId = await getActiveTenantId();
    if (!Number.isInteger(days) || days < 1 || days > 366) return { success: false, error: "Choose a date range between 1 and 366 days." };
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { zernioProfileId: true } });
    if (!tenant?.zernioProfileId) return { success: false, code: "no_connected_account", error: "Connect a social account to view this workspace’s analytics." };
    const { zernio } = await getZernioClientForTenant(tenantId);

    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const anyData = await fetchZernioAnalyticsPages(zernio, {
      profileId: tenant.zernioProfileId,
      fromDate: fmt(fromDate),
      toDate: fmt(toDate),
      source: "all",
    });

    const posts: PostRow[] = (anyData.posts || []).map((p: any): PostRow => {
      const platforms: PlatformMeta[] = Array.isArray(p.platforms)
        ? (p.platforms as any[]).map((pl) => ({
            platform: pl.platform || p.platform || "unknown",
            analytics: pl.analytics || null,
          }))
        : p.analytics
          ? [{ platform: p.platform || "unknown", analytics: p.analytics }]
          : [];
      return {
        id: p._id || p.latePostId || "unknown",
        content: p.content,
        publishedAt: publishedTimestamp(p.publishedAt),
        platforms,
      };
    });

    const allMetrics: Array<Metrics | null> = [];
    const platformMetrics: Record<string, Array<Metrics | null>> = Object.create(null);
    const dailyMetrics: Record<string, Array<Metrics | null>> = Object.create(null);
    for (const post of posts) {
      if (!post.platforms.length) {
        allMetrics.push(null);
        if (post.publishedAt) (dailyMetrics[post.publishedAt.slice(0, 10)] ??= []).push(null);
      }
      for (const platform of post.platforms) {
        allMetrics.push(platform.analytics);
        (platformMetrics[platform.platform] ??= []).push(platform.analytics);
        // An undated post contributes to the period totals, never to an invented day.
        if (post.publishedAt) (dailyMetrics[post.publishedAt.slice(0, 10)] ??= []).push(platform.analytics);
      }
    }
    const total = aggregateMetrics(allMetrics);
    const byPlatform = Object.entries(platformMetrics)
      .map(([platform, rows]) => ({ platform, label: PLATFORM_LABELS[platform] || platform, ...aggregateMetrics(rows) }))
      .sort((a, b) => (b.impressions ?? -1) - (a.impressions ?? -1));
    const series = Object.entries(dailyMetrics)
      .map(([label, rows]) => ({ label, ...aggregateMetrics(rows) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      success: true,
      summary: {
        totalPosts: posts.length,
        impressions: total.impressions,
        likes: total.likes,
        comments: total.comments,
        shares: total.shares,
        views: total.views,
        engagementRate: engagementRate(allMetrics),
        lastSync: anyData.overview?.lastSync ?? null,
        pagesFetched: anyData.pagesFetched,
        truncated: anyData.truncated,
      },
      byPlatform,
      posts,
      series,
    };
  } catch (error: any) {
    console.error("Failed to fetch analytics:", error);
    return { success: false, error: error?.message || "Failed to load analytics from Zernio." };
  }
}
