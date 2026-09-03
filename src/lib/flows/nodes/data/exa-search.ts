import { defineNode } from "../../node-contract";
import { exaSearchConfig } from "../../catalog";
import { searchWithExa } from "@/lib/search/exa-client";

const configSchema = exaSearchConfig;

export const exaSearchNode = defineNode({
  type: "data.exa_search",
  category: "data",
  label: "Web Research (Exa)",
  description:
    "Neural web search via Exa with authentic news photography extraction and domain filtering. Needs an Exa key in Settings → API Keys.",
  inputs: ["topic"],
  outputs: ["results", "images"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);

    const query = config.query.includes("{{input}}")
      ? config.query.replaceAll("{{input}}", stringify(input))
      : config.query;

    const response = await searchWithExa(
      {
        query,
        numResults: config.numResults,
        includeDomains: config.includeDomains,
        excludeDomains: config.excludeDomains,
        category: config.category || "news",
        signal: ctx.signal,
      },
      ctx.tenantId,
    );

    const results = Object.assign([...response.results], {
      images: response.images,
    });

    return {
      output: {
        results,
        images: response.images,
      },
    };
  },
});

function stringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
