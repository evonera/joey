"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getAnalytics } from "@/app/actions/analytics";
import { Loading03Icon as Loader2, ChartAverageIcon as TrendingUp } from "hugeicons-react";

// recharts is large; keep it off the initial dashboard bundle.
const AnalyticsCharts = dynamic(() => import("./analytics-charts"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />,
});

const RANGE_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Extract<Awaited<ReturnType<typeof getAnalytics>>, { success: true }> | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setIsLoading(true);
      setError(null);
      const res = await getAnalytics(days);
      if (!active) return;
      if (!res.success) {
        setError(res.error);
        setSnapshot(null);
      } else {
        setSnapshot(res);
      }
      setIsLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [days]);

  return (
    <div className="p-8 max-w-6xl mx-auto pb-24">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">Live engagement performance synced from Zernio.</p>
        </div>
        <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 rounded-lg border p-1 shadow-sm">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setDays(r.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                days === r.value
                  ? "bg-indigo-600 text-white"
                  : "text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-12 text-center">
          <TrendingUp className="h-12 w-12 text-red-400" />
          <p className="font-medium text-red-700 dark:text-red-400">{error}</p>
          <p className="text-sm text-zinc-500 max-w-md">
            Make sure a valid Zernio API key is connected and the analytics add-on is enabled, then refresh.
          </p>
        </div>
      ) : (
        snapshot && (
          <div className="space-y-6">
            <SummaryCards summary={snapshot.summary} />

            <AnalyticsCharts series={snapshot.series} byPlatform={snapshot.byPlatform} />

            {snapshot.posts.length > 0 && (
              <Section title="Per-Post Performance" subtitle="Individual posts and their engagement across platforms">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="py-2 pr-4">Post</th>
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4 text-right">Impressions</th>
                        <th className="py-2 pr-4 text-right">Likes</th>
                        <th className="py-2 pr-4 text-right">Comments</th>
                        <th className="py-2 text-right">Shares</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.posts.slice(0, 25).map((post) => {
                        const totals = post.platforms.reduce(
                          (acc, pl) => {
                            const a = pl.analytics;
                            if (!a) return acc;
                            acc.impressions += a.impressions || 0;
                            acc.likes += a.likes || 0;
                            acc.comments += a.comments || 0;
                            acc.shares += a.shares || 0;
                            return acc;
                          },
                          { impressions: 0, likes: 0, comments: 0, shares: 0 }
                        );
return (
                          <tr key={post.id} className="border-b border-zinc-100 dark:border-zinc-900">
                            <td className="py-3 pr-4">
                              <p className="line-clamp-1 max-w-md">
                                {post.content || "No caption"}
                              </p>
                              {post.platforms.some((pl) => pl.platform) && (
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  {Array.from(new Set(post.platforms.map((pl) => pl.platform).filter(Boolean))).join(", ")}
                                </p>
                              )}
                            </td>
                            <td className="py-3 pr-4 whitespace-nowrap text-zinc-500">
                              {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "—"}
                            </td>
                            <td className="py-3 pr-4 text-right tabular-nums">{totals.impressions}</td>
                            <td className="py-3 pr-4 text-right tabular-nums">{totals.likes}</td>
                            <td className="py-3 pr-4 text-right tabular-nums">{totals.comments}</td>
                            <td className="py-3 text-right tabular-nums">{totals.shares}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {snapshot.posts.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border bg-white dark:bg-zinc-900 p-12 text-center">
                <TrendingUp className="h-12 w-12 text-zinc-300 dark:text-zinc-600" />
                <p className="font-medium text-zinc-700 dark:text-zinc-300">No posts in this period</p>
                <p className="text-sm text-zinc-500 max-w-md">
                  Publish a few posts and their analytics will appear here.
                </p>
              </div>
            )}

            {!error && snapshot.success && (
              <p className="text-xs text-zinc-400 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {snapshot.summary.lastSync ? `Last synced: ${new Date(snapshot.summary.lastSync).toLocaleString()}` : "Live data from Zernio"}
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}

function SummaryCards({ summary }: { summary: { totalPosts: number; impressions: number; likes: number; comments: number; shares: number; views: number; engagementRate: number } }) {
  const cards = [
    { label: "Total Posts", value: summary.totalPosts },
    { label: "Impressions", value: summary.impressions.toLocaleString() },
    { label: "Views", value: summary.views.toLocaleString() },
    { label: "Likes", value: summary.likes.toLocaleString() },
    { label: "Comments", value: summary.comments.toLocaleString() },
    { label: "Shares", value: summary.shares.toLocaleString() },
    { label: "Engagement Rate", value: `${summary.engagementRate.toFixed(2)}%` },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-xs text-zinc-500">{c.label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white dark:bg-zinc-900 shadow-sm">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center gap-2">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-white">{title}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}