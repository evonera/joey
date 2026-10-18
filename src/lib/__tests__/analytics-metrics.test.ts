import { describe, expect, it } from "vitest";
import { aggregateMetrics, engagementRate, metricValue, publishedTimestamp } from "../analytics-metrics";

describe("observed analytics metrics", () => {
  it("keeps absent, invalid and partial metrics unknown, while retaining observed zero", () => {
    expect(aggregateMetrics([{ likes: 0 }, { likes: 5 }])).toMatchObject({ likes: 5, impressions: null });
    expect(aggregateMetrics([{ likes: 5 }, null]).likes).toBeNull();
    expect(aggregateMetrics([{ likes: 5 }, {}]).likes).toBeNull();
    expect(aggregateMetrics([]).likes).toBeNull();
    expect([undefined, null, -1, Infinity, NaN, "0"].map(metricValue)).toEqual([null, null, null, null, null, null]);
  });
  it("uses one exposure count per platform without double-counting views and impressions", () => {
    const rows = [{ impressions: 100, views: 100, likes: 10, comments: 2, shares: 3 }, { views: 50, likes: 5, comments: 0, shares: 0 }];
    expect(engagementRate(rows)).toBe(13.33);
    expect(engagementRate([{ impressions: 100, views: 1000, likes: 10, comments: 0, shares: 0 }])).toBe(10);
  });
  it("does not report a rate from missing counters or a zero exposure denominator", () => {
    expect(engagementRate([{ impressions: 100, likes: 10, comments: 0 }])).toBeNull();
    expect(engagementRate([{ impressions: 0, views: 100, likes: 0, comments: 0, shares: 0 }])).toBeNull();
    expect(engagementRate([{ views: 100, likes: 0, comments: 0, shares: 0 }])).toBe(0);
    expect(engagementRate([])).toBeNull();
  });
  it("does not invent a publication date", () => {
    expect(publishedTimestamp(undefined)).toBeUndefined();
    expect(publishedTimestamp("invalid")).toBeUndefined();
    expect(publishedTimestamp("2026-10-18T12:30:00+05:30")).toBe("2026-10-18T07:00:00.000Z");
  });
});
