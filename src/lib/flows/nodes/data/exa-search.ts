import { defineNode } from "../../node-contract";
import { exaSearchConfig } from "../../catalog";

const configSchema = exaSearchConfig;

export const exaSearchNode = defineNode({
  type: "data.exa_search",
  category: "data",
  label: "Web Research (Exa)",
  description:
    "Neural web search via Exa for research-grade results on a topic. Needs an Exa key in Settings → API Keys.",
  inputs: ["topic"],
  outputs: ["results"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);
    const apiKey = await resolveKey(ctx.tenantId);

    const query = config.query.includes("{{input}}")
      ? config.query.replaceAll("{{input}}", stringify(input))
      : config.query;

    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        numResults: config.numResults,
        contents: { text: true },
        ...(config.category ? { category: config.category } : {}),
      }),
      signal: ctx.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Exa search failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as { results?: unknown[] };
    return { output: data.results ?? [] };
  },
});

async function resolveKey(tenantId: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const { apiKeys } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { decrypt } = await import("@/lib/crypto");
  const tenantKey = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.tenantId, tenantId),
      eq(apiKeys.provider, "exa"),
    ),
  });
  if (tenantKey) {
    if (tenantKey.status !== "active") {
      throw new Error("Exa API key for this workspace is revoked or disabled.");
    }
    return decrypt(tenantKey.encryptedKey);
  }
  if (process.env.EXA_API_KEY) return process.env.EXA_API_KEY;
  throw new Error("No Exa API key. Add one in Settings → API Keys (provider: exa).");
}

function stringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
