import OpenAI from "openai";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { imageGenConfig } from "../../catalog";
import { defineNode } from "../../node-contract";
import { outboundRequest } from "../../outbound-request";
import { uploadAndRegisterFlowAsset } from "../../asset-registration";

async function openAiKey(tenantId: string) {
  const key = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "openai")) });
  if (key?.status === "active") return decrypt(key.encryptedKey);
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new Error("No active OpenAI key is configured.");
}

export const imageGenNode = defineNode({
  type: "ai.image", category: "ai", label: "Generate image", description: "Generates and durably registers an image asset.",
  inputs: ["idea"], outputs: ["image"], configSchema: imageGenConfig,
  async execute(input, rawConfig, ctx) {
    const config = imageGenConfig.parse(rawConfig);
    const budget = await (await import("@/lib/usage")).assertBudget(ctx.tenantId);
    if (!budget.allowed) throw new Error("Monthly LLM budget reached.");
    const prompt = config.prompt.replaceAll("{{input}}", typeof input === "string" ? input : JSON.stringify(input));
    const result = await new OpenAI({ apiKey: await openAiKey(ctx.tenantId) }).images.generate({ model: "gpt-image-1", prompt, size: config.size, quality: config.quality }, { signal: ctx.signal });
    const generated = result.data?.[0];
    const body = generated?.b64_json ? Buffer.from(generated.b64_json, "base64") : generated?.url ? (await outboundRequest(generated.url, { signal: ctx.signal, maxBytes: 25 * 1024 * 1024 })).buffer : undefined;
    if (!body?.length) throw new Error("Image generation returned no image data.");
    const asset = await uploadAndRegisterFlowAsset({ tenantId: ctx.tenantId, runId: ctx.runId, key: `${ctx.tenantId}/${crypto.randomUUID()}.png`, filename: `generated-${ctx.runId}-${ctx.nodeId}.png`, mimeType: "image/png", body, signal: ctx.signal, reason: "generated image pending registration" });
    return { output: { imageUrl: asset.publicUrl, assetId: asset.id, prompt } };
  },
});
