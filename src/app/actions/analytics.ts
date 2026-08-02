"use server";

import { getActiveTenantId } from "@/lib/auth";
import { getZernioClientForTenant } from "@/lib/publisher-core";

type Metrics = {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  views?: number;
  follows?: number;
};

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

interface SeriesPoint {
  label: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  views: number;
}

function toNumber(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

const EMPTY_ACC = () => ({ impressions: 0, likes: 0, comments: 0, shares: 0, views: 0 });
type Acc = ReturnType<typeof EMPTY_ACC>;

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Twitter",
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
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    engagementRate: number;
    lastSync?: string | null;
  };
  byPlatform: { platform: string; label: string; impressions: number; likes: number; comments: number; shares: number; views: number }[];
  posts: PostRow[];
  series: SeriesPoint[];
}

export type AnalyticsResult = AnalyticsSnapshot | { success: false; error: string };

export async function getAnalytics(days = 30): Promise<AnalyticsResult> {
  try {
    const tenantId = await getActiveTenantId();
    const { zernio } = await getZernioClientForTenant(tenantId);

    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const { data } = await zernio.analytics.getAnalytics({
      query: {
        fromDate: fmt(fromDate),
        toDate: fmt(toDate),
        limit: 100,
        page: 1,
        source: "all",
      },
    });

    if (!data) {
      return { success: false, error: "No analytics returned from Zernio." };
    }

    const anyData = data as any;

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
        publishedAt: p.publishedAt || p.scheduledFor,
        platforms,
      };
    });

    const total = EMPTY_ACC();
    const platformTotals: Record<string, Acc> = {};
    const dayCount: Record<string, SeriesPoint> = {};

    for (const post of posts) {
      for (const pl of post.platforms) {
        const a = pl.analytics;
        if (!a) continue;
        const add = {
          impressions: toNumber(a.impressions),
          likes: toNumber(a.likes),
          comments: toNumber(a.comments),
          shares: toNumber(a.shares),
          views: toNumber(a.views),
        };

        total.impressions += add.impressions;
        total.likes += add.likes;
        total.comments += add.comments;
        total.shares += add.shares;
        total.views += add.views;

        const pt = platformTotals[pl.platform] || EMPTY_ACC();
        pt.impressions += add.impressions;
        pt.likes += add.likes;
        pt.comments += add.comments;
        pt.shares += add.shares;
        pt.views += add.views;
        platformTotals[pl.platform] = pt;

        const day = post.publishedAt ? post.publishedAt.slice(0, 10) : null;
        if (day) {
          const dpt = dayCount[day] || { label: day, likes: 0, comments: 0, shares: 0, impressions: 0, views: 0 };
          dpt.impressions += add.impressions;
          dpt.likes += add.likes;
          dpt.comments += add.comments;
          dpt.shares += add.shares;
          dpt.views += add.views;
          dayCount[day] = dpt;
        }
      }
    }

    const byPlatform = Object.entries(platformTotals)
      .map(([platform, v]) => ({ platform, label: PLATFORM_LABELS[platform] || platform, ...v }))
      .sort((a, b) => b.impressions - a.impressions);

    const series = Object.values(dayCount).sort((a, b) => a.label.localeCompare(b.label));

    const engagementBase = total.impressions + total.views;
    const engagementRate = engagementBase > 0 ? ((total.likes + total.comments + total.shares) / engagementBase) * 100 : 0;

    return {
      success: true,
      summary: {
        totalPosts: posts.length,
        impressions: total.impressions,
        likes: total.likes,
        comments: total.comments,
        shares: total.shares,
        views: total.views,
        engagementRate: Math.round(engagementRate * 100) / 100,
        lastSync: anyData.overview?.lastSync ?? null,
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