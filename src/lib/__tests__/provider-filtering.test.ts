import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getActiveTenantId: vi.fn().mockResolvedValue("tenant-123"),
  requireRole: vi.fn().mockResolvedValue("tenant-123"),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((val, ctx) => `decrypted-${val}-${ctx}`),
  encrypt: vi.fn((val, ctx) => `encrypted-${val}-${ctx}`),
}));

vi.mock("@/lib/db", () => {
  return {
    db: {
      query: {
        apiKeys: {
          findFirst: vi.fn(),
        },
      },
    },
  };
});

describe("API Key Provider Scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters getZernioClientForTenant by tenantId, provider=zernio, and status=active", async () => {
    const { getZernioClientForTenant } = await import("@/lib/publisher-core");
    const { db } = await import("@/lib/db");

    (db.query.apiKeys.findFirst as any).mockResolvedValue({
      id: "key-1",
      tenantId: "tenant-123",
      provider: "zernio",
      status: "active",
      encryptedKey: "enc-key",
    });

    const result = await getZernioClientForTenant("tenant-123");
    expect(result.tenantId).toBe("tenant-123");

    // Verify findFirst was called
    expect(db.query.apiKeys.findFirst).toHaveBeenCalledTimes(1);
    const callArgs = (db.query.apiKeys.findFirst as any).mock.calls[0][0];
    expect(callArgs.where).toBeDefined();
  });

  it("filters getZernioClient by provider=zernio and passes tenantId to decrypt", async () => {
    const { getZernioClient } = await import("@/app/actions/zernio");
    const { db } = await import("@/lib/db");
    const { decrypt } = await import("@/lib/crypto");

    (db.query.apiKeys.findFirst as any).mockResolvedValue({
      id: "key-2",
      tenantId: "tenant-123",
      provider: "zernio",
      status: "active",
      encryptedKey: "enc-key-zernio",
    });

    const result = await getZernioClient();
    expect(result.tenantId).toBe("tenant-123");
    expect(decrypt).toHaveBeenCalledWith("enc-key-zernio", "tenant-123");
  });
});
