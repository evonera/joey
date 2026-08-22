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
    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: config.size,
      quality: config.quality,
    });

    const b64 = result.data?.[0]?.b64_json;
    const remoteUrl = result.data?.[0]?.url;
    let publicUrl: string;

    if (b64) {
      const { uploadBufferToR2 } = await import("@/lib/storage");
      const uploaded = await uploadBufferToR2(
        Buffer.from(b64, "base64"),
        "image/png",
        ctx.tenantId,
      );
      publicUrl = uploaded.publicUrl;
    } else if (remoteUrl) {
      publicUrl = remoteUrl;
    } else {
      throw new Error("Image generation returned no output.");
    }

    try {
      // gpt-image-1 medium ≈ $0.03–0.07; record rough token-equivalent cost.
      const { recordTokenUsage } = await import("@/lib/usage");
      await recordTokenUsage(ctx.tenantId, config.quality === "high" ? 100_000 : 40_000, 0);
    } catch {
      // ignore
    }

    return { output: { imageUrl: publicUrl, prompt } };
  },
});
