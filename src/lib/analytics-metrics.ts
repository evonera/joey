/** Missing provider metrics remain unknown. Zero is an actual observation. */
export type AnalyticsMetrics = {
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
export const ANALYTICS_METRIC_KEYS = ["impressions", "likes", "comments", "shares", "views"] as const;
export type MetricTotals = Record<typeof ANALYTICS_METRIC_KEYS[number], number | null>;

export function metricValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** A total is complete only when every included platform reports that metric. */
export function aggregateMetrics(rows: Array<AnalyticsMetrics | null>): MetricTotals {
  return Object.fromEntries(ANALYTICS_METRIC_KEYS.map(key => {
    const values = rows.map(row => metricValue(row?.[key]));
    return [key, values.length && values.every(value => value !== null) ? values.reduce<number>((sum, value) => sum + value!, 0) : null];
  })) as MetricTotals;
}

/** One exposure denominator per platform: impressions, otherwise views.
 * Adding both double-counts overlapping exposures. Incomplete rows cannot establish a rate.
 */
export function engagementRate(rows: Array<AnalyticsMetrics | null>): number | null {
  let interactions = 0;
  let exposures = 0;
  for (const row of rows) {
    const likes = metricValue(row?.likes);
    const comments = metricValue(row?.comments);
    const shares = metricValue(row?.shares);
    const base = metricValue(row?.impressions) ?? metricValue(row?.views);
    if (likes === null || comments === null || shares === null || base === null) return null;
    interactions += likes + comments + shares;
    exposures += base;
  }
  return exposures > 0 ? Math.round((interactions / exposures) * 10_000) / 100 : null;
}

export function publishedTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
