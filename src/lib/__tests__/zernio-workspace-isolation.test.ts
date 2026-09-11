import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ tenant: vi.fn(), accounts: vi.fn(), analytics: vi.fn(), conversations: vi.fn(), messages: vi.fn(), mentions: vi.fn(), reviews: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveTenantId: async () => "workspace" }));
vi.mock("@/lib/publisher-core", () => ({ getZernioClientForTenant: async () => ({ zernio: {
  analytics: { getAnalytics: mock.analytics }, messages: { listInboxConversations: mock.conversations, getInboxConversationMessages: mock.messages }, mentions: { listInboxMentions: mock.mentions }, reviews: { listInboxReviews: mock.reviews },
} }) }));
vi.mock("@/lib/db", () => ({ db: {
  query: { tenants: { findFirst: mock.tenant }, socialAccounts: { findMany: mock.accounts }, engagementSyncCursors: { findFirst: async () => undefined } },
  delete: () => ({ where: vi.fn() }), insert: mock.write, update: mock.write,
} }));
import { getAnalytics } from "@/app/actions/analytics";
import { syncZernioInboxBackfill } from "@/lib/engagement-inbox";
import { resolveTenantFromPayload } from "@/lib/webhooks";
beforeEach(() => {
  vi.clearAllMocks();
  mock.tenant.mockResolvedValue({ zernioProfileId: "workspace-profile" });
  mock.accounts.mockResolvedValue([{ platformAccountId: "owned", tenantId: "workspace" }]);
  mock.analytics.mockResolvedValue({ data: { posts: [] } });
  for (const method of [mock.conversations, mock.mentions, mock.reviews]) method.mockResolvedValue({ data: { data: [{ id: "private-item", accountId: "another-workspace", platform: "instagram" }] } });
});
describe("social workspace isolation", () => {
  it("scopes analytics to the workspace profile and refuses a missing profile", async () => {
    expect((await getAnalytics()).success).toBe(true);
    expect(mock.analytics).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ profileId: "workspace-profile" }) }));
    mock.analytics.mockClear(); mock.tenant.mockResolvedValue(null);
    expect((await getAnalytics()).success).toBe(false);
    expect(mock.analytics).not.toHaveBeenCalled();
  });
  it("does not import foreign conversations, reviews or mentions even if returned by a provider", async () => {
    expect(await syncZernioInboxBackfill("workspace")).toMatchObject({ conversationsSynced: 0, activitiesSynced: 0 });
    expect(mock.write).not.toHaveBeenCalled(); expect(mock.messages).not.toHaveBeenCalled();
    for (const method of [mock.conversations, mock.mentions, mock.reviews]) expect(method).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ profileId: "workspace-profile" }) }));
  });
  it("refuses ambiguous webhook ownership instead of selecting the first workspace", async () => {
    mock.accounts.mockResolvedValue([{ tenantId: "a" }, { tenantId: "b" }]);
    const payload = { id: "event", event: "message.received", timestamp: new Date().toISOString(), account: { _id: "shared" } };
    expect(await resolveTenantFromPayload(payload)).toBeNull();
    mock.accounts.mockResolvedValue([{ tenantId: "a" }]);
    expect(await resolveTenantFromPayload(payload)).toBe("a");
  });
});
