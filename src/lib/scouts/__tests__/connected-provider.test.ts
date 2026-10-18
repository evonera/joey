import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tenant: vi.fn(), key: vi.fn(), accounts: vi.fn(), sync: vi.fn(), analytics: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { tenants: { findFirst: mocks.tenant }, apiKeys: { findFirst: mocks.key }, socialAccounts: { findMany: mocks.accounts } } } }));
vi.mock("@/lib/publisher-core", () => ({ getZernioClientForTenant: async () => ({ zernio: { analytics: { syncExternalPosts: mocks.sync, getAnalytics: mocks.analytics } } }) }));
import { ConnectedAccountScoutProvider, connectedScoutItems, connectedExternalItems } from "../connected-provider";
const platform = { accountId: "own", platform: "instagram", status: "published", syncStatus: "synced", platformPostUrl: "https://www.instagram.com/p/verified/", analytics: { views: 5, likes: 0 } };
const post = { status: "published", profileId: "profile", content: "Original caption", publishedAt: "2026-10-18T12:00:00Z", platforms: [platform] };
describe("connected social observations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tenant.mockResolvedValue({ zernioProfileId: "profile" });
    mocks.key.mockResolvedValue({ id: "key" });
    mocks.accounts.mockResolvedValue([{ platform: "instagram", accountName: "creator", platformAccountId: "own" }]);
  });
  it("keeps stable individual post identity and measured zero, while omitting unknown metrics", () => {
    const [item] = connectedScoutItems([post], "own", "instagram", "profile");
    expect(item).toMatchObject({ id: expect.stringMatching(/^url:/), views: 5, likes: 0, timestamp: "2026-10-18T12:00:00.000Z" });
    const [unknown] = connectedScoutItems([{ ...post, platforms: [{ ...platform, analytics: {} }] }], "own", "instagram", "profile");
    expect(unknown).not.toHaveProperty("views"); expect(unknown).not.toHaveProperty("likes");
  });
  it("ignores foreign accounts/profiles, unpublished posts and unsynced counters", () => {
    expect(connectedScoutItems([
      { ...post, profileId: "foreign" }, { ...post, status: "scheduled" },
      { ...post, platforms: [{ ...platform, accountId: "foreign" }] },
      { ...post, platforms: [{ ...platform, syncStatus: "pending" }] },
    ], "own", "instagram", "profile")).toEqual([]);
  });
  it("deduplicates posts by canonical URL", () => {
    expect(connectedScoutItems([post, post], "own", "instagram", "profile")).toHaveLength(1);
  });
  it("uses fresh native captions and likes without treating delayed zero views as current evidence", () => {
    const [item] = connectedExternalItems([{ platform: "instagram", platformPostUrl: platform.platformPostUrl, content: "Native post", publishedAt: post.publishedAt, analytics: { likes: 0, ...{ views: 0 } } }], "instagram");
    expect(item).toMatchObject({ text: "Native post", likes: 0, timestamp: "2026-10-18T12:00:00.000Z" });
    expect(item).not.toHaveProperty("views");
    expect(connectedExternalItems([{ platform: "tiktok", platformPostUrl: platform.platformPostUrl }], "instagram")).toEqual([]);
  });
  it("refreshes native posts before reading analytics and prefers their current caption and likes", async () => {
    mocks.sync.mockResolvedValue({ response: { status: 200 }, data: { posts: [{ platform: "instagram", platformPostUrl: platform.platformPostUrl, content: "Fresh caption", analytics: { likes: 7 } }] } });
    mocks.analytics.mockResolvedValue({ response: { status: 200 }, data: { accounts: [{ _id: "own", profileId: "profile", username: "creator" }], posts: [post] } });
    const items = await new ConnectedAccountScoutProvider("tenant").fetchRecentPosts({ platform: "instagram", targetUrl: "https://instagram.com/creator" }, { signal: AbortSignal.timeout(1000) });
    expect(mocks.sync.mock.invocationCallOrder[0]).toBeLessThan(mocks.analytics.mock.invocationCallOrder[0]);
    expect(mocks.sync.mock.calls[0][0].body).toEqual({ accountId: "own" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ text: "Fresh caption", likes: 7, views: 5 });
  });
  it("reports a failed refresh instead of presenting saved analytics as a successful new check", async () => {
    mocks.sync.mockResolvedValue({ response: { status: 409 }, error: { code: "ads_connection_required" } });
    await expect(new ConnectedAccountScoutProvider("tenant").fetchRecentPosts({ platform: "instagram", targetUrl: "https://instagram.com/creator" }, { signal: AbortSignal.timeout(1000) })).rejects.toThrow("could not refresh");
    expect(mocks.analytics).not.toHaveBeenCalled();
  });
});
