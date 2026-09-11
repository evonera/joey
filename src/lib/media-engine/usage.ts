import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaRenderJobs, mediaTranscripts } from "@/lib/db/schema";

/** Operational estimates; never a provider invoice or a customer billing event. */
export async function mediaUsage(tenantId: string) {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [jobs, transcripts] = await Promise.all([
    db.query.mediaRenderJobs.findMany({ where: and(eq(mediaRenderJobs.tenantId, tenantId), gte(mediaRenderJobs.createdAt, since)), columns: { status: true, spec: true, usage: true } }),
    db.query.mediaTranscripts.findMany({ where: and(eq(mediaTranscripts.tenantId, tenantId), gte(mediaTranscripts.createdAt, since)), columns: { durationSeconds: true, estimatedCostUsd: true } }),
  ]);
  let completedVideos = 0, generatedSeconds = 0, recordedSeconds = 0, unmeasuredAttempts = 0, computeEstimate = 0;
  let ratesConfigured = true;
  for (const job of jobs) {
    const spec = job.spec as { format: string; video?: { duration: number } };
    if (job.status === "succeeded" && spec.format === "mp4") { completedVideos++; generatedSeconds += spec.video?.duration ?? 0; }
    const attempts = (job.usage as { attempts?: Array<{ elapsedSeconds?: number; encoder?: string }> } | null)?.attempts ?? [];
    for (const attempt of attempts) {
      if (typeof attempt.elapsedSeconds !== "number") { unmeasuredAttempts++; continue; }
      recordedSeconds += attempt.elapsedSeconds;
      const rate = Number(attempt.encoder === "h264_nvenc" ? process.env.MEDIA_T4_USD_PER_SECOND : process.env.MEDIA_CPU_USD_PER_SECOND);
      if (!Number.isFinite(rate) || rate <= 0) ratesConfigured = false;
      else computeEstimate += rate * attempt.elapsedSeconds;
    }
  }
  const transcriptionEstimate = transcripts.reduce((sum, row) => sum + Number(row.estimatedCostUsd), 0);
  const measuredEstimate = ratesConfigured && !unmeasuredAttempts ? computeEstimate + transcriptionEstimate : null;
  return { completedVideos, generatedMinutes: generatedSeconds / 60, recordedWorkerSeconds: recordedSeconds, unmeasuredAttempts, transcriptionSeconds: transcripts.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0), transcriptionEstimateUsd: transcriptionEstimate, measuredEstimateUsd: measuredEstimate, measuredCostPerVideoUsd: measuredEstimate !== null && completedVideos ? measuredEstimate / completedVideos : null, measuredCostPerGeneratedMinuteUsd: measuredEstimate !== null && generatedSeconds ? measuredEstimate / (generatedSeconds / 60) : null, excludes: ["idle allocation", "container startup", "storage and network", "unreported worker crashes", "provider price adjustments"] };
}
