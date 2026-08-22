import { defineNode } from "../../node-contract";
import { transcribeConfig } from "../../catalog";
import OpenAI from "openai";

const configSchema = transcribeConfig;

export const transcribeNode = defineNode({
  type: "ai.transcribe",
  category: "ai",
  label: "Transcribe",
  description:
    "Downloads an audio/video URL and transcribes it with OpenAI Whisper. Uses your OpenAI key; spend counts against budget.",
  inputs: ["media"],
  outputs: ["transcript"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);
    const apiKey = await resolveOpenAiKey(ctx.tenantId);

    const url = extractUrl(input, config.mediaUrlField);
    if (!url) throw new Error("No media URL found on the incoming data.");

    const mediaResponse = await fetch(url, { signal: ctx.signal });
    if (!mediaResponse.ok) {
      throw new Error(`Failed to download media (${mediaResponse.status}).`);
    }
    const blob = await mediaResponse.blob();
    if (blob.size > 25 * 1024 * 1024) {
      throw new Error("Media exceeds Whisper's 25MB limit.");
    }

    const client = new OpenAI({ apiKey });
    const transcription = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: new File([blob], "media.mp4", { type: blob.type || "video/mp4" }),
      ...(config.language ? { language: config.language } : {}),
    });

    try {
      const { recordTokenUsage } = await import("@/lib/usage");
      await recordTokenUsage(ctx.tenantId, Math.ceil(blob.size / 1_000_000), 0);
    } catch {
      // ignore usage recording failures
    }

    return { output: { transcript: transcription.text, source: url } };
  },
});

function extractUrl(input: unknown, field?: string): string | undefined {
  if (field) {
    return getPath(input, field) as string | undefined;
  }
  if (typeof input === "string" && /^https?:\/\//.test(input)) return input;
  if (input && typeof input === "object") {
    for (const key of ["videoUrl", "url", "mediaUrl", "video_url", "fileUrl"]) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "string") return v;
    }
  }
  return undefined;
}

function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

async function resolveOpenAiKey(tenantId: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const { apiKeys } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { decrypt } = await import("@/lib/crypto");
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "openai")),
  });
  if (key?.encryptedKey) return decrypt(key.encryptedKey);
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new Error("No OpenAI API key available for transcription.");
}
