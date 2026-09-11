import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ list: vi.fn(), local: vi.fn(), inserted: vi.fn(), updated: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { options: { baseURL: "https://joey.test" } }, getActiveTenantId: async () => "tenant", requireRole: async () => "tenant" }));
vi.mock("@/lib/zernio-session", () => ({ getZernioClient: async () => ({ tenantId: "tenant", zernio: { accounts: { listAccounts: mock.list } } }) }));
vi.mock("@/lib/db", () => ({ db: {
  query: { tenants: { findFirst: async () => ({ zernioProfileId: "profile" }) } },
  transaction: async (fn: any) => fn({ execute: vi.fn(), query: { socialAccounts: { findMany: mock.local } }, insert: () => ({ values: mock.inserted }), update: () => ({ set: (value: unknown) => { mock.updated(value); return { where: vi.fn() }; } }) }),
} }));
import { syncConnectedAccounts } from "@/app/actions/zernio";
beforeEach(() => { vi.clearAllMocks(); mock.local.mockResolvedValue([]); });
describe("Zernio account synchronization", () => {
  it("uses SDK account IDs, display fields, profile scope and account health", async () => {
    mock.list.mockResolvedValue({ data: { accounts: [{ _id: "remote-id", platform: "instagram", displayName: "Theme Page", profilePicture: "https://example.com/avatar.png", isActive: true }] } });
    expect(await syncConnectedAccounts()).toEqual({ success: true, count: 1 });
    expect(mock.list).toHaveBeenCalledWith({ query: { profileId: "profile" } });
    expect(mock.inserted).toHaveBeenCalledWith(expect.objectContaining({ platformAccountId: "remote-id", accountName: "Theme Page", avatarUrl: "https://example.com/avatar.png", isActive: true }));
  });
  it("never reports a provider error as successful or deactivates local accounts", async () => {
    mock.list.mockResolvedValue({ error: { error: "Unauthorized" } });
    expect((await syncConnectedAccounts()).error).toBeTruthy(); expect(mock.local).not.toHaveBeenCalled();
  });
  it("rejects missing remote IDs and preserves current data", async () => {
    mock.list.mockResolvedValue({ data: { accounts: [{ platform: "instagram" }] } });
    expect((await syncConnectedAccounts()).error).toBeTruthy(); expect(mock.inserted).not.toHaveBeenCalled();
  });
  it("does not reactivate accounts requiring OAuth reconnection", async () => {
    mock.list.mockResolvedValue({ data: { accounts: [{ _id: "remote-id", platform: "instagram", isActive: true, needsReconnection: true }] } });
    mock.local.mockResolvedValue([{ id: "local", platform: "instagram", platformAccountId: "remote-id", isActive: true }]);
    await syncConnectedAccounts(); expect(mock.updated).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });
});
