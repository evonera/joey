export const ANALYTICS_PAGE_SIZE = 100;
export const ANALYTICS_MAX_PAGES = 50;

type AnalyticsClient = {
  analytics: {
    getAnalytics(input: { query: Record<string, unknown> }): Promise<{ data?: unknown; error?: unknown }>;
  };
};

type AnalyticsListPage = {
  overview?: Record<string, unknown> & { lastSync?: string | null };
  posts?: Array<Record<string, unknown>>;
  pagination?: { page?: number; limit?: number; total?: number; pages?: number };
};

export type PaginatedAnalytics = {
  overview?: Record<string, unknown> & { lastSync?: string | null };
  posts: Array<Record<string, unknown>>;
  pagesFetched: number;
  totalReported?: number;
  truncated: boolean;
};

/**
 * Follow Zernio's 1-based page/pages contract and deduplicate post ids in case
 * the remote data set changes while the snapshot is being read. A hard bound
 * keeps a single dashboard request from issuing an unbounded number of calls.
 */
export async function fetchZernioAnalyticsPages(
  client: AnalyticsClient,
  baseQuery: Record<string, unknown>,
  maxPages = ANALYTICS_MAX_PAGES,
): Promise<PaginatedAnalytics> {
  const posts: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let overview: (Record<string, unknown> & { lastSync?: string | null }) | undefined;
  let totalReported: number | undefined;
  let pagesFetched = 0;
  let expectedPages: number | undefined;
  let truncated = false;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await client.analytics.getAnalytics({
      query: { ...baseQuery, limit: ANALYTICS_PAGE_SIZE, page },
    });
    if (error || !data) throw new Error("No analytics returned from Zernio.");

    const current = data as AnalyticsListPage;
    const rows = Array.isArray(current.posts) ? current.posts : [];
    pagesFetched = page;
    if (page === 1) overview = current.overview;

    const remotePages = Number(current.pagination?.pages);
    if (Number.isSafeInteger(remotePages) && remotePages > 0) expectedPages = remotePages;
    const remoteTotal = Number(current.pagination?.total);
    if (Number.isSafeInteger(remoteTotal) && remoteTotal >= 0) totalReported = remoteTotal;

    for (const post of rows) {
      const id = typeof post._id === "string"
        ? post._id
        : typeof post.latePostId === "string"
          ? post.latePostId
          : undefined;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      posts.push(post);
    }

    if (expectedPages !== undefined) {
      if (page >= expectedPages) break;
      if (page === maxPages) truncated = true;
    } else if (rows.length < ANALYTICS_PAGE_SIZE) {
      break;
    } else if (page === maxPages) {
      truncated = true;
    }
  }

  return { overview, posts, pagesFetched, totalReported, truncated };
}
