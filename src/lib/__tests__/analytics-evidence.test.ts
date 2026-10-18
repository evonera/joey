import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveTenantId: async () => "workspace" }));
vi.mock("@/lib/publisher-core", () => ({ getZernioClientForTenant: async () => ({ zernio: {} }) }));
vi.mock("@/lib/db", () => ({ db: { query: { tenants: { findFirst: async () => ({ zernioProfileId: "profile" }) } } } }));
vi.mock("@/lib/zernio-analytics", () => ({ fetchZernioAnalyticsPages: mocks.data }));
import { getAnalytics } from "@/app/actions/analytics";

beforeEach(() => vi.clearAllMocks());
describe("analytics evidence snapshot", () => {
  it("does not substitute scheduled dates and keeps missing metrics unknown in every aggregate", async () => {
    mocks.data.mockResolvedValue({ pagesFetched: 1, truncated: false, posts: [
      { _id: "undated", scheduledFor: "2026-10-19T00:00:00Z", platforms: [{ platform: "instagram", analytics: { likes: 1 } }] },
      { _id: "dated", publishedAt: "2026-10-18T00:00:00Z", platforms: [{ platform: "youtube", analytics: { views: 100, likes: 10, comments: 0, shares: 0 } }] },
    ] });
    const result = await getAnalytics();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.posts[0].publishedAt).toBeUndefined();
    expect(result.summary).toMatchObject({ likes: 11, impressions: null, views: null, comments: null, engagementRate: null });
    expect(result.series).toEqual([{ label: "2026-10-18", impressions: null, likes: 10, comments: 0, shares: 0, views: 100 }]);
    expect(result.byPlatform.find(row => row.platform === "instagram")?.impressions).toBeNull();
  });
  it("does not silently omit a post whose platform metrics were not returned", async () => {
    mocks.data.mockResolvedValue({ pagesFetched: 1, truncated: false, posts: [
      { _id: "missing", platforms: [] },
      { _id: "known", platforms: [{ platform: "instagram", analytics: { impressions: 100, likes: 10, comments: 0, shares: 0 } }] },
    ] });
    const result = await getAnalytics();
    expect(result.success && result.summary.impressions).toBeNull();
    expect(result.success && result.summary.engagementRate).toBeNull();
  });
  it("matches the post-level denominator for the aggregate rate", async () => {
    mocks.data.mockResolvedValue({ pagesFetched: 1, truncated: false, posts: [{ _id: "known", platforms: [
      { platform: "instagram", analytics: { impressions: 100, views: 200, likes: 10, comments: 2, shares: 3 } },
      { platform: "youtube", analytics: { views: 50, likes: 5, comments: 0, shares: 0 } },
    ] }] });
    const result = await getAnalytics();
    expect(result.success && result.summary.engagementRate).toBe(13.33);
  });
});
