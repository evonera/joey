import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      contentPackages: { findMany: vi.fn().mockResolvedValue([]) },
      themeSlots: { findMany: vi.fn().mockResolvedValue([]) },
    },
    update: vi.fn().mockReturnValue({ set: () => ({ where: () => ({ where: () => Promise.resolve([]) }) }) }),
  },
}));

vi.mock("@/lib/publisher-core", () => ({
  getZernioClientForTenant: vi.fn().mockResolvedValue({
    zernio: { analytics: { getAnalytics: vi.fn() } },
  }),
}));

vi.mock("@/lib/operations-log", () => ({
  operationalEvent: vi.fn(),
}));

import { mapZernioToEngagementMetrics, syncThemeStudioAnalytics, processThemeStudioAnalyticsSync } from "../analytics-sync";
import { db } from "@/lib/db";
import { getZernioClientForTenant } from "@/lib/publisher-core";

describe("mapZernioToEngagementMetrics", () => {
  it("maps all available metrics", () => {
    const result = mapZernioToEngagementMetrics({
      reach: 1500,
      likes: 200,
      comments: 30,
      shares: 15,
      saves: 8,
      impressions: 2000,
      follows: 5,
    });
    expect(result).toEqual({
      reach: 1500,
      likes: 200,
      comments: 30,
      shares: 15,
      saves: 8,
      impressions: 2000,
      follows: 5,
    });
  });

  it("defaults missing metrics to 0", () => {
    const result = mapZernioToEngagementMetrics({});
    expect(result).toEqual({
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
    });
  });

  it("omits optional fields when not provided", () => {
    const result = mapZernioToEngagementMetrics({ reach: 100, likes: 20 });
    expect(result).toEqual({
      reach: 100,
      likes: 20,
      comments: 0,
      shares: 0,
      saves: 0,
    });
    expect(result).not.toHaveProperty("impressions");
    expect(result).not.toHaveProperty("follows");
  });
});

describe("syncThemeStudioAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty result when no published packages exist", async () => {
    const result = await syncThemeStudioAnalytics("tenant-1");
    expect(result).toEqual({ processed: 0, updated: 0, skipped: 0, errors: 0 });
  });

  it("skips packages without zernioPostId", async () => {
    (db.query.contentPackages.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "pkg-1", metrics: {} },
    ]);
    const result = await syncThemeStudioAnalytics("tenant-1");
    expect(result.skipped).toBe(1);
  });

  it("fetches analytics and updates metrics for eligible packages", async () => {
    const mockGetAnalytics = vi.fn().mockResolvedValue({
      data: { analytics: { reach: 500, likes: 50, comments: 10 } },
    });
    (getZernioClientForTenant as ReturnType<typeof vi.fn>).mockResolvedValue({
      zernio: { analytics: { getAnalytics: mockGetAnalytics } },
    });

    const mockUpdate = vi.fn().mockReturnValue({
      set: () => ({ where: () => ({ where: () => Promise.resolve([]) }) }),
    });
    (db as unknown as { update: typeof mockUpdate }).update = mockUpdate;

    (db.query.contentPackages.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "pkg-1", metrics: { zernioPostId: "zernio-1" }, updatedAt: new Date() },
    ]);

    const result = await syncThemeStudioAnalytics("tenant-1");
    expect(result.processed).toBe(1);
    expect(result.updated).toBe(1);
    expect(mockGetAnalytics).toHaveBeenCalledWith({ query: { postId: "zernio-1" } });
  });

  it("skips packages with recent sync and engagement data", async () => {
    (db.query.contentPackages.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "pkg-1",
        metrics: {
          zernioPostId: "zernio-1",
          reach: 100,
          likes: 10,
          analyticsSyncedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    ]);

    const result = await syncThemeStudioAnalytics("tenant-1");
    // Package is filtered out as ineligible (recent sync + engagement data),
    // so processed=0 and skipped=candidates.length
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
  });
});
