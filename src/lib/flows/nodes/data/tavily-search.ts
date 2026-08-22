import { defineNode } from "../../node-contract";
import { tavilySearchConfig } from "../../catalog";

const configSchema = tavilySearchConfig;

export const tavilySearchNode = defineNode({
  type: "data.tavily_search",
  category: "data",
  label: "Web Research (Tavily)",
  description:
    "Fast web search with an LLM-ready answer via Tavily. Needs a Tavily key in Settings → API Keys.",
  inputs: ["topic"],
  outputs: ["results"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);
    const apiKey = await resolveKey(ctx.tenantId);

    const query = config.query.includes("{{input}}")
      ? config.query.replaceAll("{{input}}", stringify(input))
      : config.query;

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: config.searchDepth,
        max_results: config.maxResults,
        include_answer: config.includeAnswer,
      }),
      signal: ctx.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Tavily search failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as { results?: unknown[]; answer?: string };
    return { output: { answer: data.answer, results: data.results ?? [] } };
  },
});

async function resolveKey(tenantId: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const { apiKeys } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { decrypt } = await import("@/lib/crypto");
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "tavily")),
  });
  if (key?.encryptedKey) return decrypt(key.encryptedKey);
  if (process.env.TAVILY_API_KEY) return process.env.TAVILY_API_KEY;
  throw new Error("No Tavily API key. Add one in Settings → API Keys (provider: tavily).");
}

function stringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
