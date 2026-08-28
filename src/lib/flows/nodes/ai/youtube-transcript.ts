import { defineNode } from "../../node-contract";
import { youtubeTranscriptConfig } from "../../catalog";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

async function resolveKey(tenantId: string): Promise<string> {
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "supadata")),
  });
  if (key?.encryptedKey) return decrypt(key.encryptedKey);
  if (process.env.SUPADATA_API_KEY) return process.env.SUPADATA_API_KEY;
  throw new Error("No Supadata key. Add one in Settings → API Keys (provider: supadata).");
}

function extractUrl(input: unknown, field?: string): string | undefined {
  if (field) {
    return field
      .split(".")
      .reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), input) as string | undefined;
  }
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    for (const key of ["url", "link", "videoUrl"]) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "string") return v;
    }
  }
  return undefined;
}

export const youtubeTranscriptNode = defineNode({
  type: "ai.youtube_transcript",
  category: "ai",
  label: "YouTube transcript",
  description: "Fetches a YouTube video's transcript via Supadata for repurposing into posts.",
  inputs: ["video"],
  outputs: ["transcript"],
  configSchema: youtubeTranscriptConfig,
  async execute(input, rawConfig, ctx) {
    const config = youtubeTranscriptConfig.parse(rawConfig);
    const apiKey = await resolveKey(ctx.tenantId);

    const url = extractUrl(input, config.videoUrlField);
    if (!url || !/youtube\.com|youtu\.be/.test(url)) {
      throw new Error("No YouTube URL found on the incoming data.");
    }

    const response = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(url)}`,
      { headers: { "x-api-key": apiKey }, signal: ctx.signal },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Supadata failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      content?: string | { text?: string }[];
      title?: string;
    };
    const transcript =
      typeof data.content === "string"
        ? data.content
        : Array.isArray(data.content)
          ? data.content.map((c) => c.text ?? "").join(" ")
          : "";

    if (!transcript) throw new Error("Supadata returned an empty transcript.");

    try {
      const { recordTokenUsage } = await import("@/lib/usage");
      await recordTokenUsage(ctx.tenantId, Math.ceil(transcript.length / 4), 0);
    } catch {
      // ignore usage recording failures
    }

    return { output: { transcript, title: data.title, source: url } };
  },
});
