"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeriesPoint = { label: string; impressions: number; likes: number; comments: number; shares: number };
type PlatformPoint = { platform: string; label: string; impressions: number; likes: number; comments: number; shares: number; views: number };

/**
 * Chart-heavy section split out of the analytics page so recharts stays off
 * the initial dashboard bundle (loaded via next/dynamic, ssr disabled).
 */
export default function AnalyticsCharts({
  series,
  byPlatform,
}: {
  series: SeriesPoint[];
  byPlatform: PlatformPoint[];
}) {
  return (
    <>
      {series.length > 0 && (
        <Section title="Engagement Over Time" subtitle="Daily impressions, likes, comments, and shares">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#888" />
                <YAxis tick={{ fontSize: 12 }} stroke="#888" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="impressions" name="Impressions" stroke="#6366f1" strokeWidth={2} />
                <Line type="monotone" dataKey="likes" name="Likes" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="comments" name="Comments" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {byPlatform.length > 0 && (
        <Section title="By Platform" subtitle="Aggregated performance across each social platform">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPlatform} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#888" />
                <YAxis tick={{ fontSize: 12 }} stroke="#888" />
                <Tooltip />
                <Legend />
                <Bar dataKey="impressions" name="Impressions" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="likes" name="Likes" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comments" name="Comments" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}
    </>
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
