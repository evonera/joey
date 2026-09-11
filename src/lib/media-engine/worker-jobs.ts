import { createHash } from "node:crypto";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, mediaRenderJobs } from "@/lib/db/schema";
import { buildPublicUrl, headObject, mediaWorkerUrls } from "@/lib/storage";
import { enqueueR2Cleanup, cancelR2Cleanup } from "@/lib/storage-cleanup";
import { renderTemplateHtml } from "./templates";
import { referencedAssets, renderSpecSchema, RENDERER_VERSION, FONT_VERSION } from "./spec";

export async function claimNextRender() {
  if (process.env.MEDIA_ENGINE_ENABLED !== "true") return null;
  return db.transaction(async tx => {
    await tx.execute(sql`UPDATE media_render_jobs SET status = CASE WHEN attempt < 3 THEN 'queued' ELSE 'failed' END,
      attempt_token = NULL, error = 'Worker lease expired', updated_at = now(),
      usage = jsonb_build_object('attempts', coalesce(usage->'attempts', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('attempt', attempt, 'elapsedSeconds', NULL, 'allocationUnknown', true)))
      WHERE status = 'rendering' AND updated_at < now() - interval '10 minutes'`);
    const [claimed] = await tx
      .select({ id: mediaRenderJobs.id })
      .from(mediaRenderJobs)
      .where(and(eq(mediaRenderJobs.status, "queued"), lt(mediaRenderJobs.attempt, 3)))
      .orderBy(asc(mediaRenderJobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!claimed) return null;
    const [row] = await tx.update(mediaRenderJobs).set({ status: "rendering", attempt: sql`${mediaRenderJobs.attempt} + 1`, attemptToken: crypto.randomUUID(), updatedAt: new Date(), error: null }).where(eq(mediaRenderJobs.id, claimed.id)).returning();
    return row;
  });
  }

export async function claimRenderJob() {
  const job = await claimNextRender();
  if (!job) return null;
  try {
    const spec = renderSpecSchema.parse(job.spec);
    const refs = referencedAssets(spec);
    const records = await db.query.assets.findMany({ where: and(eq(assets.tenantId, job.tenantId), inArray(assets.id, refs.map(ref => ref.id))) });
    const keys = refs.map(ref => {
      const record = records.find(item => item.id === ref.id);
      if (!record || record.key !== ref.version) throw new Error("Source asset no longer available.");
      return record.key;
    });
    const outputKey = `${job.tenantId}/renders/${job.id}/${job.attemptToken}.${spec.format}`;
    await enqueueR2Cleanup(job.tenantId, outputKey, "Unsettled media render upload", { notBefore: new Date(Date.now() + 30 * 60_000) });
    const mimeType = spec.format === "mp4" ? "video/mp4" : "image/png";
    const urls = await mediaWorkerUrls(keys, outputKey, mimeType);
    let audioUploadUrl: string | undefined;
    if (spec.video?.captions) {
      const audioKey = `${job.tenantId}/renders/${job.id}/${job.attemptToken}.mp3`;
      await enqueueR2Cleanup(job.tenantId, audioKey, "Temporary transcription audio", { notBefore: new Date(Date.now() + 30 * 60_000) });
      audioUploadUrl = (await mediaWorkerUrls([], audioKey, "audio/mpeg")).uploadUrl;
    }
    const layout = await renderTemplateHtml(spec);
    const layoutHash = createHash("sha256").update(JSON.stringify({ html: layout.html, renderer: RENDERER_VERSION, fonts: FONT_VERSION, images: spec.format === "png" ? [spec.media, spec.inset] : [] })).digest("hex");
    const captureKey = `${job.tenantId}/media-cache/${layoutHash}.png`;
    await enqueueR2Cleanup(job.tenantId, captureKey, "Expired template capture cache", { notBefore: new Date(Date.now() + 30 * 24 * 60 * 60_000) });
    const captureUrls = await mediaWorkerUrls([captureKey], captureKey, "image/png");
    return { ...layout, captureCache: { getUrl: captureUrls.inputs[0], putUrl: captureUrls.uploadUrl }, jobId: job.id, attemptToken: job.attemptToken, spec, rendererVersion: RENDERER_VERSION, fontVersion: FONT_VERSION,
      audioUploadUrl, inputs: refs.map((ref, i) => ({ id: ref.id, url: urls.inputs[i] })), uploadUrl: urls.uploadUrl, mimeType };
  } catch (error) {
    await db.update(mediaRenderJobs).set({ status: job.attempt < 3 ? "queued" : "failed", attemptToken: null, error: error instanceof Error ? error.message : "Asset preparation failed", updatedAt: new Date() }).where(and(eq(mediaRenderJobs.id, job.id), eq(mediaRenderJobs.attemptToken, job.attemptToken!)));
    throw error;
  }
}

export const completionSchema = z.object({
  jobId: z.uuid(), attemptToken: z.uuid(), success: z.boolean(), error: z.string().max(1000).optional(),
  usage: z.object({ elapsedSeconds: z.number().finite().min(0).max(600), encoder: z.string().max(50), outputSeconds: z.number().min(0).max(60) }).strict(),
}).strict();
export async function completeRenderJob(input: z.infer<typeof completionSchema>, inspect = headObject) {
  const snapshot = await db.query.mediaRenderJobs.findFirst({ where: eq(mediaRenderJobs.id, input.jobId) });
  if (!snapshot || snapshot.status !== "rendering" || snapshot.attemptToken !== input.attemptToken || snapshot.updatedAt.getTime() < Date.now() - 600_000) return { accepted: false };
  const spec = renderSpecSchema.parse(snapshot.spec);
  const key = `${snapshot.tenantId}/renders/${snapshot.id}/${input.attemptToken}.${spec.format}`;
  const mimeType = spec.format === "mp4" ? "video/mp4" : "image/png";
  const metadata = input.success ? await inspect(key) : undefined;
  if (input.success && (!metadata?.ContentLength || metadata.ContentLength > 150 * 1024 * 1024 || metadata.ContentType !== mimeType)) throw new Error("Invalid rendered object metadata.");
  const result = await db.transaction(async tx => {
    const [job] = await tx.select().from(mediaRenderJobs).where(eq(mediaRenderJobs.id, input.jobId)).for("update");
    if (!job || job.status !== "rendering" || job.attemptToken !== input.attemptToken || job.updatedAt.getTime() < Date.now() - 600_000) return { accepted: false };
    let assetId: string | undefined;
    if (input.success) {
      const [asset] = await tx.insert(assets).values({ tenantId: job.tenantId, filename: `${spec.template}.${spec.format}`, key, mimeType, size: metadata!.ContentLength!, publicUrl: buildPublicUrl(key), width: 1080, height: spec.format === "mp4" ? 1920 : 1350 }).returning();
      assetId = asset.id;
    }
    await tx.update(mediaRenderJobs).set({ status: input.success ? "succeeded" : "failed", outputAssetId: assetId, usage: { attempts: [...((job.usage as { attempts?: unknown[] } | null)?.attempts ?? []), { ...input.usage, attempt: job.attempt, succeeded: input.success, cpuCores: 2, memoryMiB: 4096 }] }, error: input.success ? null : input.error || "Rendering failed", updatedAt: new Date() }).where(eq(mediaRenderJobs.id, job.id));
    return { accepted: true };
  });
  if (result.accepted && input.success) await cancelR2Cleanup(key);
  if (result.accepted && spec.source.kind === "theme_package") {
    const { settleThemeRender } = await import("./theme-adapter");
    await settleThemeRender(snapshot.tenantId, spec.source.id);
  }
  return result;
}
