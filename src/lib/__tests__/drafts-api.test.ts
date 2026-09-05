import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  authenticateApiRequest: vi.fn(),
  requireScope: vi.fn(),
  withRateLimitHeaders: vi.fn((resp) => resp),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(),
    query: {
      drafts: {
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/flows/nodes/ai/transcribe", () => ({
  validateSafeUrl: vi.fn(async (url: string) => {
    if (url.includes("localhost") || url.includes("127.0.0.1") || url.includes("169.254")) {
      throw new Error("Target media hostname is forbidden.");
    }
    return { url: new URL(url), ip: "93.184.216.34" };
  }),
}));

describe("Drafts API Input Validation & SSRF Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty content with 400", async () => {
    const { authenticateApiRequest } = await import("@/lib/api-auth");
    (authenticateApiRequest as any).mockResolvedValue({
      tenantId: "tenant-test",
      scopes: ["read", "write"],
      rateLimit: {},
    });

    const { POST } = await import("@/app/api/v1/drafts/route");
    const request = new Request("http://localhost/api/v1/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("content");
  });

  it("rejects SSRF / private IP media URLs with 400", async () => {
    const { authenticateApiRequest } = await import("@/lib/api-auth");
    (authenticateApiRequest as any).mockResolvedValue({
      tenantId: "tenant-test",
      scopes: ["read", "write"],
      rateLimit: {},
    });

    const { POST } = await import("@/app/api/v1/drafts/route");
    const request = new Request("http://localhost/api/v1/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "Valid draft post",
        mediaUrls: ["http://169.254.169.254/latest/meta-data"],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Unsafe media URL rejected");
  });

  it("accepts valid content and safe media URLs", async () => {
    const { authenticateApiRequest } = await import("@/lib/api-auth");
    const { db } = await import("@/lib/db");

    (authenticateApiRequest as any).mockResolvedValue({
      tenantId: "tenant-test",
      scopes: ["read", "write"],
      rateLimit: {},
    });

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "draft-1", content: "Safe draft" }]),
      }),
    });

    const { POST } = await import("@/app/api/v1/drafts/route");
    const request = new Request("http://localhost/api/v1/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "Safe draft",
        mediaUrls: ["https://images.unsplash.com/photo-1234"],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.draft.id).toBe("draft-1");
  });

  it("accepts platform targeting parameter in draft creation", async () => {
    const { authenticateApiRequest } = await import("@/lib/api-auth");
    const { db } = await import("@/lib/db");

    (authenticateApiRequest as any).mockResolvedValue({
      tenantId: "tenant-test",
      scopes: ["read", "write"],
      rateLimit: {},
    });

    const valuesSpy = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "draft-2", content: "Twitter draft" }]),
    });
    (db.insert as any).mockReturnValue({
      values: valuesSpy,
    });

    const { POST } = await import("@/app/api/v1/drafts/route");
    const request = new Request("http://localhost/api/v1/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "Twitter draft",
        platform: "twitter",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Twitter draft",
        platformOptions: expect.objectContaining({ platform: "x" }),
      })
    );
  });
});
