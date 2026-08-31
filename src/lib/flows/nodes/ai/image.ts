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
