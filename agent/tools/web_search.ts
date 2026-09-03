import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchWithExa } from "@/lib/search/exa-client";

export default defineTool({
  description:
    "Search the live web for recent news, trending topics, facts, statistics, and authentic image URLs. Supports domain whitelisting (e.g. ['espn.com', 'nba.com']) and news category filtering.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        "The search query, e.g. 'Lakers trade deadline rumors' or 'Anthropic Claude 3.7 release'.",
      ),
    includeDomains: z
      .array(z.string())
      .optional()
      .describe(
        "Optional list of domains to filter by, e.g. ['espn.com', 'nba.com'].",
      ),
    category: z
      .enum(["news", "company", "research", "general"])
      .default("news")
      .describe("Content category filter."),
    numResults: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe("Number of search results to retrieve."),
  }),
  execute: async ({ query, includeDomains, category, numResults }, ctx) => {
    const tenantId = ctx.session?.auth?.current?.attributes?.tenantId as
      | string
      | undefined;

    try {
      const response = await searchWithExa(
        {
          query,
          includeDomains,
          category,
          numResults,
          signal: ctx.abortSignal,
        },
        tenantId,
      );

      return {
        query,
        count: response.results.length,
        results: response.results.map((r) => ({
          title: r.title,
          url: r.url,
          publishedDate: r.publishedDate,
          heroImage: r.heroImage,
          imageLinks: r.imageLinks,
          snippet:
            r.highlights.join(" ... ") ||
            (r.text ? r.text.slice(0, 300) : ""),
        })),
        availableImages: response.images,
      };
    } catch (err: any) {
      return {
        query,
        error: err.message || "Failed to execute web search",
        results: [],
        availableImages: [],
      };
    }
  },
  toModelOutput(output) {
    if (output.error) {
      return {
        type: "text",
        value: `Search error for "${output.query}": ${output.error}`,
      };
    }

    const formattedArticles = output.results
      .map((r, i) => {
        let text = `[${i + 1}] ${r.title}\nURL: ${r.url}\nPublished: ${r.publishedDate || "Recent"}\nSnippet: ${r.snippet}`;
        if (r.heroImage) {
          text += `\nPhoto: ${r.heroImage}`;
        }
        return text;
      })
      .join("\n\n");

    const imageSummary =
      output.availableImages.length > 0
        ? `\n\nDiscovered ${output.availableImages.length} authentic images for social media graphics:\n${output.availableImages.slice(0, 5).join("\n")}`
        : "";

    return {
      type: "text",
      value: `Web Search Results for "${output.query}":\n\n${formattedArticles}${imageSummary}`,
    };
  },
});
