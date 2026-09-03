import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { youtubeTranscriptConfig } from "../../catalog";
import { defineNode } from "../../node-contract";
import { outboundRequest } from "../../outbound-request";

function inputUrl(input: unknown, field?: string): unknown { return field ? field.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, input) : input; }

export const youtubeTranscriptNode = defineNode({
  type: "ai.youtube_transcript", category: "ai", label: "YouTube transcript", description: "Fetches a YouTube transcript through Supadata.",
  inputs: ["video"], outputs: ["transcript"], configSchema: youtubeTranscriptConfig,
  async execute(input, rawConfig, ctx) {
    const config = youtubeTranscriptConfig.parse(rawConfig);
    const value = inputUrl(input, config.videoUrlField);
    const url = typeof value === "string" ? value : value && typeof value === "object" ? String((value as Record<string, unknown>).url ?? (value as Record<string, unknown>).videoUrl ?? "") : "";
    const parsed = new URL(url);
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(parsed.hostname.toLowerCase())) throw new Error("A valid YouTube URL is required.");
    const stored = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.tenantId, ctx.tenantId), eq(apiKeys.provider, "supadata")) });
    const apiKey = stored?.status === "active" ? decrypt(stored.encryptedKey, ctx.tenantId) : process.env.SUPADATA_API_KEY;
    if (!apiKey) throw new Error("No active Supadata key is configured.");
    const response = await outboundRequest(`https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(url)}`, { signal: ctx.signal, timeoutMs: 60_000, maxBytes: 10 * 1024 * 1024, headers: { "x-api-key": apiKey, accept: "application/json" } });
    if (response.status < 200 || response.status >= 300) throw new Error(`Supadata returned HTTP ${response.status}.`);
    const data = JSON.parse(response.buffer.toString("utf8")) as { content?: string | Array<{ text?: string }>; title?: string };
    const transcript = typeof data.content === "string" ? data.content : data.content?.map(({ text }) => text ?? "").join(" ") ?? "";
    if (!transcript) throw new Error("Supadata returned an empty transcript.");
    return { output: { transcript, title: data.title, source: url } };
  },
});
