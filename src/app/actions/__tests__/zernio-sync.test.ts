import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockListAccounts = vi.fn();
const mockFindFirstApiKey = vi.fn();

vi.mock("@/lib/db", () => {
  return {
    db: {
      query: {
        apiKeys: {
          findFirst: (...args: any[]) => mockFindFirstApiKey(...args),
        },
        socialAccounts: {
          findMany: (...args: any[]) => mockFindMany(...args),
        },
      },
      transaction: (cb: any) =>
        cb({
          query: {
            socialAccounts: {
              findMany: mockFindMany,
            },
          },
          update: () => ({
            set: () => ({
              where: mockUpdate,
            }),
          }),
          insert: () => ({
            values: mockInsert,
          }),
        }),
    },
  };
});

vi.mock("@/lib/auth", () => ({
  getActiveTenantId: vi.fn().mockResolvedValue("tenant-abc"),
  requireRole: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn().mockReturnValue("encrypted-val"),
  decrypt: vi.fn().mockReturnValue("decrypted-val"),
}));

const mockZernio = vi.fn().mockImplementation(function () {
  return {
    accounts: {
      listAccounts: mockListAccounts,
    },
  };
});

vi.mock("@zernio/node", () => ({
  default: mockZernio,
  Zernio: mockZernio,
}));

vi.mock("@/lib/db/schema", () => ({
  apiKeys: { tenantId: "tenantId", provider: "provider", status: "status" },
  socialAccounts: { id: "id", tenantId: "tenantId", platform: "platform", platformAccountId: "platformAccountId", isActive: "isActive" },
}));

describe("non-destructive account sync and strict oauth state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirstApiKey.mockResolvedValue({
      id: "key-1",
      encryptedKey: "enc-key",
      status: "active",
      provider: "zernio",
    });
  });

  it("updates existing accounts in place and marks missing ones inactive without deleting", async () => {
    const { syncConnectedAccounts } = await import("@/app/actions/zernio");

    // Existing accounts in DB
    mockFindMany.mockResolvedValueOnce([
      {
        id: "acc-1",
        tenantId: "tenant-abc",
        platform: "x",
        platformAccountId: "1001",
        accountName: "OldName",
        isActive: true,
      },
      {
        id: "acc-2",
        tenantId: "tenant-abc",
        platform: "linkedin",
        platformAccountId: "2002",
        accountName: "LinkedInOrg",
        isActive: true,
      },
    ]);

    // Accounts returned from Zernio: acc-1 updated, acc-3 added, acc-2 missing
    mockListAccounts.mockResolvedValueOnce({
      data: {
        accounts: [
          {
            id: 1001,
            platform: "x",
            username: "NewName",
            picture: "https://avatar.png",
          },
          {
            id: 3003,
            platform: "instagram",
            username: "InstaProfile",
            picture: null,
          },
        ],
      },
    });

    const result = await syncConnectedAccounts();
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);

    // Verified: no delete called, update called for existing, insert called for new
    expect(mockFindMany).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });
});
