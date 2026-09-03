import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchWithExa, resolveExaKey } from "../exa-client";

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      apiKeys: {
        findFirst: vi.fn(),
      },https://github.com/evonera/joey/pull/75/conflict?name=src%252Flib%252Fsearch%252F__tests__%252Fexa-client.test.ts&base_oid=a2086953765b6334dd77e24d85d90c915037be12&head_oid=989b0be7794bfd317a195cbdb990d4e89d40c0f5
    },
  },
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((val) => `decrypted_${val}`),
}));

describe("Exa Search Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EXA_API_KEY;
  });

  it("resolves encrypted key from database for active tenant", async () => {
    const { db } = await import("@/lib/db");
    (db.query.apiKeys.findFirst as any).mockResolvedValue({
      encryptedKey: "secret_exa_key",
      status: "active",
    });

    const key = await resolveExaKey("tenant-123");
    expect(key).toBe("decrypted_secret_exa_key");
  });

  it("falls back to process.env.EXA_API_KEY when no database key", async () => {
    const { db } = await import("@/lib/db");
    (db.query.apiKeys.findFirst as any).mockResolvedValue(null);
    process.env.EXA_API_KEY = "env_exa_key";

    const key = await resolveExaKey("tenant-123");
    expect(key).toBe("env_exa_key");
  });

  it("throws error when no Exa key is available", async () => {
    const { db } = await import("@/lib/db");
    (db.query.apiKeys.findFirst as any).mockResolvedValue(null);

    await expect(resolveExaKey("tenant-123")).rejects.toThrow(
      "No Exa API key configured",
    );
  });

  it("executes search, passes domain filters, and extracts images", async () => {
    const { db } = await import("@/lib/db");
    (db.query.apiKeys.findFirst as any).mockResolvedValue({
      encryptedKey: "test_key",
      status: "active",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "article_1",
            title: "Lakers Win in Thriller",
            url: "https://espn.com/nba/story/1",
            image: "https://espn.com/photos/lebron.jpg",
            highlights: ["LeBron scored 35 points", "Fourth quarter comeback"],
          },
        ],
      }),
    });
    global.fetch = mockFetch;

    const response = await searchWithExa(
      {
        query: "Lakers game",
        includeDomains: ["espn.com", "nba.com"],
        category: "news",
      },
      "tenant-123",
    );

    expect(response.results).toHaveLength(1);
    expect(response.results[0].title).toBe("Lakers Win in Thriller");
    expect(response.results[0].heroImage).toBe("https://espn.com/photos/lebron.jpg");
    expect(response.results[0].imageLinks).toEqual(["https://espn.com/photos/lebron.jpg"]);
    expect(response.images).toEqual(["https://espn.com/photos/lebron.jpg"]);

    // Check payload passed to fetch
    const [, fetchOptions] = mockFetch.mock.calls[0];
    const payload = JSON.parse(fetchOptions.body);
    expect(payload.type).toBe("auto");
    expect(payload.includeDomains).toEqual(["espn.com", "nba.com"]);
    expect(payload.category).toBe("news");
    expect(payload.contents).toEqual({ highlights: true });
    // Should NOT request text or extras (antipattern per Exa docs)
    expect(payload.contents.text).toBeUndefined();
  });
});
