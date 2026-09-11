import { defineNode } from "../../node-contract";
import { transcribeConfig } from "../../catalog";
import OpenAI from "openai";
import { getWhisperCost, WHISPER_USD_PER_MINUTE } from "@/lib/ai-pricing";
import { failUsageReservation, reserveUsageBudget, settleUsageReservation } from "@/lib/usage";

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

    const initialUrl = extractUrl(input, config.mediaUrlField);
    if (!initialUrl) throw new Error("No media URL found on the incoming data.");

    const { outboundRequest } = await import("../../outbound-request");
    const media = await outboundRequest(initialUrl, { signal: ctx.signal, timeoutMs: 60_000, maxBytes: 25 * 1024 * 1024 });
    if (media.status < 200 || media.status >= 300) throw new Error(`Media download returned HTTP ${media.status}.`);
    const buffer = media.buffer;
    const contentType = String(media.headers["content-type"] ?? "application/octet-stream");
    const finalUrl = media.finalUrl;
    if (buffer.length > 25 * 1024 * 1024) {
      throw new Error("Media exceeds Whisper's 25MB limit.");
    }

    const { assertBudget } = await import("@/lib/usage");
    const budget = await assertBudget(ctx.tenantId);
    if (!budget.allowed) {
      throw new Error(
        `Monthly LLM budget reached ($${budget.costUsd.toFixed(2)} / $${budget.budgetUsd}). ` +
          "Review AI usage in Settings.",
      );
    }

    const maximumMinutes = Number(process.env.AI_TRANSCRIPTION_MAX_MINUTES || 60);
    if (!Number.isFinite(maximumMinutes) || maximumMinutes <= 0 || maximumMinutes > 240) {
      throw new Error("AI_TRANSCRIPTION_MAX_MINUTES must be between 1 and 240.");
    }
    const reservation = await reserveUsageBudget({
      tenantId: ctx.tenantId,
      kind: "transcription",
      modelId: "whisper-1",
      estimatedCostUsd: maximumMinutes * WHISPER_USD_PER_MINUTE,
      metadata: { runId: ctx.runId, nodeId: ctx.nodeId, source: "flow" },
    });
    const client = new OpenAI({ apiKey });
    let transcription: Awaited<ReturnType<typeof client.audio.transcriptions.create>>;
    try {
      transcription = await client.audio.transcriptions.create({
        model: "whisper-1",
        file: new File([buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer], "media.mp4", { type: contentType || "video/mp4" }),
        response_format: "verbose_json",
        ...(config.language ? { language: config.language } : {}),
      }, { signal: ctx.signal });
    } catch (error) {
      try { await failUsageReservation(reservation.id, { providerOutcome: "ambiguous" }); } catch {}
      throw error;
    }
    const durationSeconds = "duration" in transcription ? Number(transcription.duration) : NaN;
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      await failUsageReservation(reservation.id, { providerOutcome: "missing_duration" });
      throw new Error("Transcription provider did not return billable audio duration.");
    }
    await settleUsageReservation({
      id: reservation.id,
      actualCostUsd: getWhisperCost(durationSeconds),
      metadata: { durationSeconds },
    });

    return { output: { transcript: transcription.text, source: finalUrl } };
  },
});

export type SafeMediaTarget = { url: URL; ip: string };

/**
 * Validates a URL AND binds the decision to a concrete, freshly resolved IP.
 * Delegates to the unified resolveOutboundTarget implementation.
 */
export async function validateSafeUrl(urlStr: string): Promise<SafeMediaTarget> {
  const { resolveOutboundTarget } = await import("../../outbound-request");
  try {
    const { url, address } = await resolveOutboundTarget(urlStr);
    return { url, ip: address };
  } catch (err: any) {
    if (
      err?.message?.includes("resolves to a private") ||
      err?.message?.includes("resolves to private")
    ) {
      throw new Error("Hostname resolves to private IP");
    }
    throw err;
  }
}

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
  const tenantKey = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.tenantId, tenantId),
      eq(apiKeys.provider, "openai"),
    ),
  });
  if (tenantKey) {
    if (tenantKey.status !== "active") {
      throw new Error("OpenAI API key for this workspace is revoked or disabled.");
    }
    return decrypt(tenantKey.encryptedKey, tenantId);
  }
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new Error("No OpenAI API key available for transcription.");
}
