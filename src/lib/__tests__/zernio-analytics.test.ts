import { describe, expect, it, vi } from "vitest";
import { ANALYTICS_PAGE_SIZE, fetchZernioAnalyticsPages } from "@/lib/zernio-analytics";

describe("Zernio analytics pagination", () => {
  it("loads and combines every reported page beyond 100 posts", async () => {
    const getAnalytics = vi.fn(async ({ query }: { query: Record<string, unknown> }) => {
      const page = Number(query.page);
      const count = page < 3 ? ANALYTICS_PAGE_SIZE : 37;
      return {
        data: {
          overview: { lastSync: "2026-09-07T00:00:00Z" },
          pagination: { page, limit: ANALYTICS_PAGE_SIZE, total: 237, pages: 3 },
          posts: Array.from({ length: count }, (_, index) => ({ _id: `post-${page}-${index}` })),
        },
      };
    });

    const result = await fetchZernioAnalyticsPages({ analytics: { getAnalytics } }, { profileId: "profile-1" });

    expect(result.posts).toHaveLength(237);
    expect(result.pagesFetched).toBe(3);
    expect(result.truncated).toBe(false);
    expect(getAnalytics).toHaveBeenCalledTimes(3);
    expect(getAnalytics.mock.calls[2][0].query).toMatchObject({ page: 3, limit: 100, profileId: "profile-1" });
  });

  it("deduplicates drifting pages and reports a bounded truncation", async () => {
    const getAnalytics = vi.fn(async ({ query }: { query: Record<string, unknown> }) => ({
      data: {
        pagination: { page: query.page, limit: ANALYTICS_PAGE_SIZE, total: 400, pages: 4 },
        posts: [{ _id: "stable" }, { _id: `post-${query.page}` }],
      },
    }));

    const result = await fetchZernioAnalyticsPages({ analytics: { getAnalytics } }, {}, 2);

    expect(result.posts.map((post) => post._id)).toEqual(["stable", "post-1", "post-2"]);
    expect(result.pagesFetched).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("fails the snapshot if any required page fails", async () => {
    const getAnalytics = vi.fn(async ({ query }: { query: Record<string, unknown> }) =>
      query.page === 1
        ? { data: { pagination: { pages: 2 }, posts: Array.from({ length: 100 }, () => ({})) } }
        : { error: { message: "provider unavailable" } },
    );

    await expect(fetchZernioAnalyticsPages({ analytics: { getAnalytics } }, {})).rejects.toThrow("No analytics returned");
  });
});
