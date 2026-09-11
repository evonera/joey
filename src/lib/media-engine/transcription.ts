import { createHash } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { db } from "@/lib/db";
import { apiKeys, mediaRenderJobs, mediaTranscripts } from "@/lib/db/schema";
import { renderSpecSchema } from "./spec";
import { readMediaObject } from "@/lib/storage";
import { decrypt } from "@/lib/crypto";
import { failUsageReservation, releaseUsageReservation, reserveUsageBudget, settleUsageReservation } from "@/lib/usage";
import { WHISPER_USD_PER_MINUTE } from "@/lib/ai-pricing";

/** Separate from layout identity: changing a headline reuses the audio transcript. */
export function transcriptHash(media: { id: string; version: string }, start: number, duration: number) {
  return createHash("sha256").update(JSON.stringify({ provider: "openai", model: "whisper-1", timingVersion: 1, media, start, duration })).digest("hex");
}

type TranscriptResult = { duration: number; text: string; words?: Array<{ word: string; start: number; end: number }> };
type Dependencies = { readAudio?: typeof readMediaObject; transcribe?: (key: string, audio: Buffer) => Promise<TranscriptResult> };
async function requestTranscript(key: string, audio: Buffer): Promise<TranscriptResult> {
  const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 120_000 });
  return client.audio.transcriptions.create({ model: "whisper-1", file: new File([new Uint8Array(audio)], "clip.mp3", { type: "audio/mpeg" }), response_format: "verbose_json", timestamp_granularities: ["word"] });
}

export async function transcribeRender(jobId: string, attemptToken: string, dependencies: Dependencies = {}) {
  const job = await db.query.mediaRenderJobs.findFirst({ where: and(eq(mediaRenderJobs.id, jobId), eq(mediaRenderJobs.attemptToken, attemptToken), eq(mediaRenderJobs.status, "rendering")) });
  if (!job || job.updatedAt.getTime() < Date.now() - 600_000) throw new Error("Render lease expired.");
  const spec = renderSpecSchema.parse(job.spec);
  if (!spec.video?.captions) throw new Error("This render does not request automatic captions.");
  const inputHash = transcriptHash(spec.media, spec.video.start, spec.video.duration);
  const cached = await db.query.mediaTranscripts.findFirst({ where: and(eq(mediaTranscripts.tenantId, job.tenantId), eq(mediaTranscripts.inputHash, inputHash)) });
  if (cached?.status === "succeeded") return { words: cached.words };
  // Ambiguous paid requests never automatically repeat. An operator can reconcile
  // failed/abandoned transcription entries without causing silent duplicate spend.
  if (cached) throw new Error(cached.status === "processing" ? "Transcription is already processing; retry shortly." : "Transcription failed. Review the workspace key and transcription diagnostics.");
  const key = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.tenantId, job.tenantId), eq(apiKeys.provider, "openai"), eq(apiKeys.status, "active")) });
  if (!key) throw new Error("Add an active OpenAI key to this workspace to generate captions.");
  const configuredRate = process.env.MEDIA_TRANSCRIPTION_USD_PER_MINUTE;
  const rate = configuredRate === undefined ? WHISPER_USD_PER_MINUTE : Number(configuredRate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Configure the transcription price before enabling automatic captions.");
  const audio = await (dependencies.readAudio ?? readMediaObject)(`${job.tenantId}/renders/${job.id}/${attemptToken}.mp3`, 2 * 1024 * 1024);
  // Reserve the selected duration before the paid call. Failed/ambiguous calls
  // retain that estimate until operator reconciliation; never report them free.
  const reservedCost = Number((Math.ceil(spec.video.duration) / 60 * rate).toFixed(8));
  const reservation = await reserveUsageBudget({
    tenantId: job.tenantId,
    kind: "transcription",
    modelId: "whisper-1",
    estimatedCostUsd: reservedCost,
    metadata: { source: "media-render", jobId: job.id, inputHash },
  });
  let cache: typeof mediaTranscripts.$inferSelect | undefined;
  try {
    cache = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`transcription:${job.tenantId}`}))`);
      const [monthlyUsage] = await tx
        .select({ value: count() })
        .from(mediaTranscripts)
        .where(and(
          eq(mediaTranscripts.tenantId, job.tenantId),
          sql`${mediaTranscripts.createdAt} >= date_trunc('month', now() AT TIME ZONE 'UTC')`,
        ));
      const limit = Number(process.env.MEDIA_MONTHLY_TRANSCRIPT_LIMIT || 1000);
      if (!Number.isSafeInteger(limit) || limit < 1 || Number(monthlyUsage?.value ?? 0) >= limit) throw new Error("Workspace monthly transcription limit reached.");
      const [row] = await tx.insert(mediaTranscripts).values({ tenantId: job.tenantId, inputHash, attemptToken, status: "processing" }).onConflictDoNothing().returning();
      if (!row) return;
      await tx.update(mediaTranscripts).set({ estimatedCostUsd: reservedCost.toFixed(8) }).where(eq(mediaTranscripts.id, row.id));
      return row;
    });
  } catch (error) {
    await releaseUsageReservation(reservation.id, { providerCalled: false, cacheClaimFailed: true });
    throw error;
  }
  if (!cache) {
    await releaseUsageReservation(reservation.id, { duplicateCacheClaim: true });
    throw new Error("Transcription is already processing; retry shortly.");
  }
  try {
    const result = await (dependencies.transcribe ?? requestTranscript)(decrypt(key.encryptedKey, job.tenantId), audio);
    const actualCost = Number((result.duration / 60 * rate).toFixed(8));
    await settleUsageReservation({ id: reservation.id, actualCostUsd: actualCost, metadata: { durationSeconds: result.duration } });
    if (!Number.isFinite(result.duration) || result.duration > 61) throw new Error("Unexpected transcription duration.");
    if (result.text.trim() && !result.words?.length) throw new Error("Provider did not return word timestamps.");
    const words = (result.words ?? []).map(word => ({ text: word.word.trim(), start: word.start, end: word.end })).filter(word => word.text && word.end > word.start && word.start < spec.video!.duration).map(word => ({ ...word, end: Math.min(word.end, spec.video!.duration) }));
    // Validate actual provider timing before it can enter the video renderer.
    renderSpecSchema.parse({ ...spec, video: { ...spec.video, captions: false, words } });
    await db.update(mediaTranscripts).set({ status: "succeeded", words, durationSeconds: result.duration, estimatedCostUsd: actualCost.toFixed(8), updatedAt: new Date() }).where(and(eq(mediaTranscripts.id, cache.id), eq(mediaTranscripts.attemptToken, attemptToken)));
    return { words };
  } catch {
    await failUsageReservation(reservation.id, { providerOutcome: "ambiguous" });
    await db.update(mediaTranscripts).set({ status: "failed", error: "Transcription did not complete. Provider usage may need reconciliation.", updatedAt: new Date() }).where(eq(mediaTranscripts.id, cache.id));
    throw new Error("Transcription failed. Check the workspace key and provider usage before retrying.");
  }
}
