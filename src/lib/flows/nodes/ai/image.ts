import { defineNode } from "../../node-contract";
import { imageGenConfig } from "../../catalog";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

async function resolveOpenAiKey(tenantId: string): Promise<string> {
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "openai")),
  });
  if (key?.encryptedKey) return decrypt(key.encryptedKey);
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new Error("No OpenAI API key available for image generation.");
}

function template(text: string, input: unknown): string {
  if (!text.includes("{{input}}")) return text;
  const asText = typeof input === "string" ? input : JSON.stringify(input);
  return text.replaceAll("{{input}}", asText);
}

export const imageGenNode = defineNode({
  type: "ai.image",
  category: "ai",
  label: "Generate image",
  description: "Generates an image with gpt-image-1 and uploads it to your asset library. Spend counts against budget.",
  inputs: ["idea"],
  outputs: ["image"],
  configSchema: imageGenConfig,
  async execute(input, rawConfig, ctx) {
    const config = imageGenConfig.parse(rawConfig);
    const apiKey = await resolveOpenAiKey(ctx.tenantId);

    const { assertBudget } = await import("@/lib/usage");
    const budget = await assertBudget(ctx.tenantId);
    if (!budget.allowed) {
      throw new Error(
        `Monthly LLM budget reached ($${budget.costUsd.toFixed(2)} / $${budget.budgetUsd}).`,
      );
    }

    const prompt = template(config.prompt, input);

    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });
    const result = await client.images.generate(
      {
        model: "gpt-image-1",
        prompt,
        size: config.size,
        quality: config.quality,
      },
      { signal: ctx.signal },
    );

    const b64 = result.data?.[0]?.b64_json;
    const remoteUrl = result.data?.[0]?.url;
    let publicUrl: string;

    let buffer: Buffer;
    if (b64) {
      buffer = Buffer.from(b64, "base64");
    } else if (remoteUrl) {
      const { fetchSafeMedia } = await import("./transcribe");
      const safe = await fetchSafeMedia(remoteUrl, ctx.signal);
      buffer = safe.buffer;
    } else {
      throw new Error("Image generation returned no output.");
    }

    if (ctx.signal?.aborted) {
      throw (ctx.signal.reason as Error) ?? new Error("Aborted");
    }

    const { uploadBufferToR2, deleteObjectWithRetry } = await import("@/lib/storage");
    const uploaded = await uploadBufferToR2(buffer, "image/png", ctx.tenantId);
    publicUrl = uploaded.publicUrl;

    let registered = false;
    let asset: { id: string; publicUrl: string } | undefined;
    try {
      if (ctx.signal?.aborted) {
        throw (ctx.signal.reason as Error) ?? new Error("Aborted");
      }

      // Register asset in the library so it appears in assets list and drafts can use it
      const { db } = await import("@/lib/db");
      const { assets, flowRuns } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      [asset] = await db.transaction(async (tx) => {
        if (ctx.runId) {
          const [lockedRun] = await tx
            .select({ id: flowRuns.id })
            .from(flowRuns)
            .where(and(eq(flowRuns.id, ctx.runId), eq(flowRuns.status, "running")))
            .for("update");
          if (!lockedRun) {
            throw new Error("Execution fenced: flow run is no longer running.");
          }
        }
        return await tx
          .insert(assets)
          .values({
            tenantId: ctx.tenantId,
            filename: `generated-image-${Date.now()}.png`,
            key: uploaded.key,
            mimeType: "image/png",
            size: buffer.length,
            publicUrl: uploaded.publicUrl,
          })
          .returning({ id: assets.id, publicUrl: assets.publicUrl });
      });
      registered = true;
    } finally {
      if (!registered) {
        await deleteObjectWithRetry(uploaded.key);
      }
    }

    try {
      // gpt-image-1 medium ≈ $0.03–0.07; record rough token-equivalent cost.
      const { recordTokenUsage } = await import("@/lib/usage");
      await recordTokenUsage(ctx.tenantId, config.quality === "high" ? 100_000 : 40_000, 0);
    } catch {
      // ignore
    }

    return { output: { imageUrl: asset?.publicUrl ?? publicUrl, assetId: asset?.id, prompt } };
  },
});
