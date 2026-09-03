import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveProviderApiKey,
  resolveModelForTurn,
} from "@/lib/agent-model-resolver";
import { encrypt } from "@/lib/crypto";

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

describe("agent-model-resolver", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("resolves encrypted BYOK key from database for active tenant", async () => {
    const { db } = await import("@/lib/db");
    const tenantId = "tenant-123";
    const rawKey = "AIzaSyTestGoogleKey123456";
    const encryptedKey = encrypt(rawKey, tenantId);

    (db.query.apiKeys.findFirst as any).mockResolvedValueOnce({
      id: "key-1",
      tenantId,
      provider: "google",
      encryptedKey,
      status: "active",
    });

    const resolved = await resolveProviderApiKey("google", tenantId);
    expect(resolved).toBe(rawKey);
  });

  it("falls back to environment variable when no DB key exists", async () => {
    const { db } = await import("@/lib/db");
    (db.query.apiKeys.findFirst as any).mockResolvedValueOnce(null);

    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaSyEnvGoogleKey";
    const resolved = await resolveProviderApiKey("google", "tenant-no-key");
    expect(resolved).toBe("AIzaSyEnvGoogleKey");
  });

  it("throws a descriptive error when no API key is available for the requested model", async () => {
    const { db } = await import("@/lib/db");
    (db.query.apiKeys.findFirst as any).mockResolvedValueOnce(null);
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    await expect(
      resolveModelForTurn({ preferredModel: "google/gemini-2.5-flash", tenantId: "tenant-empty" })
    ).rejects.toThrow(/No active API key found for Gemini 2.5 Flash/);
  });

  it("successfully instantiates the model when an active key is found", async () => {
    const { db } = await import("@/lib/db");
    const tenantId = "tenant-google";
    const rawKey = "AIzaSyValidTestKey12345";
    const encryptedKey = encrypt(rawKey, tenantId);

    (db.query.apiKeys.findFirst as any).mockResolvedValueOnce({
      id: "key-google",
      tenantId,
      provider: "google",
      encryptedKey,
      status: "active",
    });

    const result = await resolveModelForTurn({
      preferredModel: "google/gemini-2.5-flash",
      tenantId,
    });

    expect(result.model).toBeDefined();
    expect(result.modelContextWindowTokens).toBe(1_048_576);
  });
});
