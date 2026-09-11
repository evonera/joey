import OpenAI from "openai";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { imageGenConfig } from "../../catalog";
import { defineNode } from "../../node-contract";
import { outboundRequest } from "../../outbound-request";
import { uploadAndRegisterFlowAsset } from "../../asset-registration";
import { estimateGptImage2Cost, getGptImage2Cost } from "@/lib/ai-pricing";
import { failUsageReservation, reserveUsageBudget, settleUsageReservation } from "@/lib/usage";

async function openAiKey(tenantId: string) {
  const key = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "openai")) });
  if (key && key.status !== "active") throw new Error("The OpenAI key for this workspace is disabled. Update it in Settings → AI Providers.");
  if (key?.status === "active") return decrypt(key.encryptedKey, tenantId);
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new Error("No active OpenAI key is configured.");
}

function isImageBuffer(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.subarray(8, 12).toString("ascii") === "WEBP") return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  return false;
}

function imageMimeAndExt(buf: Buffer): { mimeType: string; ext: string } {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mimeType: "image/jpeg", ext: ".jpg" };
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.subarray(8, 12).toString("ascii") === "WEBP") return { mimeType: "image/webp", ext: ".webp" };
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return { mimeType: "image/gif", ext: ".gif" };
  return { mimeType: "image/png", ext: ".png" };
}

function interpolatePrompt(template: string, input: unknown): string {
  return template.replace(/\{\{input(?:\.([a-zA-Z0-9_.$]+))?\}\}/g, (_match, path) => {
    if (!path) return typeof input === "string" ? input : JSON.stringify(input);
    const value = path.split(".").reduce((acc: unknown, key: string) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), input);
    return value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  });
}

export const imageGenNode = defineNode({
  type: "ai.image", category: "ai", label: "Generate image", description: "Generates and durably registers an image asset.",
  inputs: ["idea"], outputs: ["image"], configSchema: imageGenConfig,
  async execute(input, rawConfig, ctx) {
    const config = imageGenConfig.parse(rawConfig);
    const budget = await (await import("@/lib/usage")).assertBudget(ctx.tenantId);
    if (!budget.allowed) throw new Error("Monthly LLM budget reached.");
    const prompt = interpolatePrompt(config.prompt, input);
    const apiKey = await openAiKey(ctx.tenantId);
    const reservation = await reserveUsageBudget({
      tenantId: ctx.tenantId,
      kind: "image",
      modelId: "gpt-image-2",
      estimatedCostUsd: estimateGptImage2Cost(prompt, config.size, config.quality),
      metadata: { runId: ctx.runId, nodeId: ctx.nodeId, size: config.size, quality: config.quality },
    });
    let result: Awaited<ReturnType<OpenAI["images"]["generate"]>>;
    try {
      result = await new OpenAI({ apiKey }).images.generate({ model: "gpt-image-2", prompt, size: config.size, quality: config.quality }, { signal: ctx.signal });
    } catch (error) {
      try { await failUsageReservation(reservation.id, { providerOutcome: "ambiguous" }); } catch {}
      throw error;
    }
    const imageUsage = result.usage;
    await settleUsageReservation({
      id: reservation.id,
      inputTokens: imageUsage?.input_tokens ?? 0,
      outputTokens: imageUsage?.output_tokens ?? 0,
      actualCostUsd: imageUsage
        ? getGptImage2Cost({
            textInputTokens: imageUsage.input_tokens_details.text_tokens,
            imageInputTokens: imageUsage.input_tokens_details.image_tokens,
            outputTokens: imageUsage.output_tokens,
          })
        : estimateGptImage2Cost(prompt, config.size, config.quality),
      metadata: { providerUsageAvailable: Boolean(imageUsage) },
    });
    const generated = result.data?.[0];
    let body: Buffer | undefined;
    if (generated?.b64_json) {
      body = Buffer.from(generated.b64_json, "base64");
    } else if (generated?.url) {
      const response = await outboundRequest(generated.url, { signal: ctx.signal, maxBytes: 25 * 1024 * 1024 });
      if (response.status < 200 || response.status >= 300) throw new Error(`Image download returned HTTP ${response.status}.`);
      const contentType = String(response.headers["content-type"] ?? "");
      if (contentType && !contentType.toLowerCase().startsWith("image/") && !isImageBuffer(response.buffer)) {
        throw new Error(`Image download returned non-image Content-Type: ${contentType}.`);
      }
      body = response.buffer;
    }
    if (!body?.length || !isImageBuffer(body)) throw new Error("Image generation returned invalid or non-image payload.");
    const { mimeType, ext } = imageMimeAndExt(body);
    const asset = await uploadAndRegisterFlowAsset({ tenantId: ctx.tenantId, runId: ctx.runId, key: `${ctx.tenantId}/${crypto.randomUUID()}${ext}`, filename: `generated-${ctx.runId}-${ctx.nodeId}${ext}`, mimeType, body, signal: ctx.signal, reason: "generated image pending registration" });
    return { output: { imageUrl: asset.publicUrl, assetId: asset.id, prompt } };
  },
});
