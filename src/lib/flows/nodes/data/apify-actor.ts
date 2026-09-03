import { defineNode } from "../../node-contract";
import { apifyActorConfig } from "../../catalog";

const configSchema = apifyActorConfig;

export const apifyActorNode = defineNode({
  type: "data.apify_actor",
  category: "data",
  label: "Apify Actor",
  description:
    "Runs any Apify actor synchronously and returns its dataset items (scrapes, extracts…). Needs an Apify token in Settings → API Keys.",
  inputs: ["input"],
  outputs: ["items"],
  configSchema,
  async execute(_input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);
    const token = await resolveToken(ctx.tenantId);

    let actorInput: unknown;
    try {
      actorInput = JSON.parse(config.inputJson || "{}");
    } catch {
      throw new Error("Actor input is not valid JSON.");
    }

    const url =
      `https://api.apify.com/v2/acts/${encodeURIComponent(config.actorId)}` +
      `/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${config.timeoutSeconds}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput),
      signal: ctx.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Apify actor failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const data: unknown = await response.json();
    return { output: Array.isArray(data) ? data : [data] };
  },
});

export async function resolveToken(tenantId: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const { apiKeys } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { decrypt } = await import("@/lib/crypto");
  const tenantKey = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.tenantId, tenantId),
      eq(apiKeys.provider, "apify"),
    ),
  });
  if (tenantKey) {
    if (tenantKey.status !== "active") {
      throw new Error("Apify token for this workspace is revoked or disabled.");
    }
    return decrypt(tenantKey.encryptedKey, tenantId);
  }
  if (process.env.APIFY_TOKEN) return process.env.APIFY_TOKEN;
  throw new Error("No Apify token. Add one in Settings → API Keys (provider: apify).");
}
