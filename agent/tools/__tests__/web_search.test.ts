import { describe, it, expect, vi, beforeEach } from "vitest";
import webSearchTool from "../web_search";

vi.mock("@/lib/search/exa-client", () => ({
  searchWithExa: vi.fn(),
}));

describe("Eve Agent web_search tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has valid tool descriptor", () => {
    expect(webSearchTool.description).toContain("Search the live web");
  });

  it("executes search and returns formatted structured output", async () => {
    const { searchWithExa } = await import("@/lib/search/exa-client");
    (searchWithExa as any).mockResolvedValue({
      results: [
        {
          id: "res_1",
          title: "Steph Curry Breaks Record",
          url: "https://nba.com/news/curry",
          publishedDate: "2026-03-01",
          heroImage: "https://nba.com/photos/curry.jpg",
          imageLinks: ["https://nba.com/photos/shot.jpg"],
          highlights: ["Curry hits 12 threes"],
        },
      ],
      images: ["https://nba.com/photos/curry.jpg", "https://nba.com/photos/shot.jpg"],
    });

    const mockCtx: any = {
      session: {
        auth: {
          current: {
            attributes: { tenantId: "tenant_abc" },
          },
        },
      },
    };

    const output = await webSearchTool.execute(
      {
        query: "Steph Curry",
        includeDomains: ["nba.com", "espn.com"],
        category: "news",
        numResults: 5,
      },
      mockCtx,
    );

    expect(output.count).toBe(1);
    expect(output.results[0].title).toBe("Steph Curry Breaks Record");
    expect(output.availableImages).toHaveLength(2);

    // Test toModelOutput formatting
    expect(webSearchTool.toModelOutput).toBeDefined();
    const modelOutput = await webSearchTool.toModelOutput!(output as any);
    expect((modelOutput as any).type).toBe("text");
    expect((modelOutput as any).value).toContain("Steph Curry Breaks Record");
    expect((modelOutput as any).value).toContain("https://nba.com/photos/curry.jpg");
    expect((modelOutput as any).value).toContain("Discovered 2 authentic images");
  });

  it("handles search errors gracefully in execute and toModelOutput", async () => {
    const { searchWithExa } = await import("@/lib/search/exa-client");
    (searchWithExa as any).mockRejectedValue(new Error("No Exa key"));

    const mockCtx: any = {
      session: { auth: { current: { attributes: { tenantId: "tenant_abc" } } } },
    };

    const output = await webSearchTool.execute(
      {
        query: "Test",
        category: "news",
        numResults: 5,
      },
      mockCtx,
    );
    expect(output.error).toBe("No Exa key");

    expect(webSearchTool.toModelOutput).toBeDefined();
    const modelOutput = await webSearchTool.toModelOutput!(output as any);
    expect((modelOutput as any).value).toContain('Search error for "Test": No Exa key');
  });
});
