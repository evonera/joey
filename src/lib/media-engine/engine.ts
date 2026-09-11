import { dispatchQueuedRender } from "./dispatch";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, contentPackages, flows, mediaRenderJobs } from "@/lib/db/schema";
import { renderHash, renderSpecSchema, referencedAssets } from "./spec";

/** Server runtime only. The tenant is derived by the authenticated caller. */
export async function submitRender(tenantId: string, input: unknown, options: { dispatch?: boolean } = {}) {
  if (process.env.MEDIA_ENGINE_ENABLED !== "true") throw new Error("The new media renderer is not enabled.");
  const spec = renderSpecSchema.parse(input);
  const result = await db.transaction(async tx => {
    // Serialize quota checks and identical submissions within a workspace.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media:${tenantId}`}))`);
    const source = spec.source.kind === "theme_package"
      ? await tx.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, spec.source.id), eq(contentPackages.tenantId, tenantId)) })
      : await tx.query.flows.findFirst({ where: and(eq(flows.id, spec.source.id), eq(flows.tenantId, tenantId)) });
    if (!source) throw new Error("Render source does not belong to this workspace.");
    const refs = referencedAssets(spec);
    const owned = await tx.query.assets.findMany({ where: and(eq(assets.tenantId, tenantId), inArray(assets.id, refs.map(ref => ref.id))) });
    for (const ref of refs) {
      const row = owned.find(item => item.id === ref.id);
      if (!row || row.key !== ref.version) throw new Error("A source asset is missing or its version changed.");
      const expected = ref === spec.music ? "audio/" : ref === spec.media && spec.format === "mp4" ? "video/" : "image/";
      if (!row.mimeType.startsWith(expected)) throw new Error("Source asset type does not match the template.");
    }
    const inputHash = renderHash(spec);
    const existing = await tx.query.mediaRenderJobs.findFirst({ where: and(eq(mediaRenderJobs.tenantId, tenantId), eq(mediaRenderJobs.inputHash, inputHash)) });
    if (existing) return { jobId: existing.id, status: existing.status };
    const [monthlyUsage] = await tx
      .select({ value: count() })
      .from(mediaRenderJobs)
      .where(and(
        eq(mediaRenderJobs.tenantId, tenantId),
        sql`${mediaRenderJobs.createdAt} >= date_trunc('month', now() AT TIME ZONE 'UTC')`,
      ));
    const limit = Number(process.env.MEDIA_MONTHLY_JOB_LIMIT || 1000);
    if (!Number.isSafeInteger(limit) || limit < 1 || Number(monthlyUsage?.value ?? 0) >= limit) throw new Error("Workspace monthly render limit reached.");
    const [job] = await tx.insert(mediaRenderJobs).values({ tenantId, inputHash, spec }).returning();
    return { jobId: job.id, status: job.status };
  });
  if (result.status === "queued" && options.dispatch !== false) await dispatchQueuedRender(result.jobId);
  return result;
}

export async function getRender(tenantId: string, jobId: string) {
  const job = await db.query.mediaRenderJobs.findFirst({ where: and(eq(mediaRenderJobs.id, jobId), eq(mediaRenderJobs.tenantId, tenantId)) });
  if (!job) throw new Error("Render not found.");
  const output = job.status === "succeeded" && job.outputAssetId
    ? await db.query.assets.findFirst({ where: and(eq(assets.id, job.outputAssetId), eq(assets.tenantId, tenantId)), columns: { id: true, publicUrl: true, mimeType: true, size: true } }) : undefined;
  return { jobId: job.id, status: job.status, error: job.error, output, usage: job.usage, canRetry: ["failed", "cancelled"].includes(job.status) && job.attempt < 3 };
}

export async function cancelRender(tenantId: string, jobId: string) {
  await db.update(mediaRenderJobs).set({ status: "cancelled", attemptToken: null, updatedAt: new Date() })
    .where(and(eq(mediaRenderJobs.id, jobId), eq(mediaRenderJobs.tenantId, tenantId), inArray(mediaRenderJobs.status, ["queued", "rendering"])));
  return getRender(tenantId, jobId);
}

/** Explicit user retry; stale attempt tokens remain fenced and total claims stay bounded. */
export async function retryRender(tenantId: string, jobId: string) {
  if (process.env.MEDIA_ENGINE_ENABLED !== "true") throw new Error("The media renderer is not enabled.");
  await db.transaction(async tx => {
    const [job] = await tx.select().from(mediaRenderJobs).where(and(eq(mediaRenderJobs.id, jobId), eq(mediaRenderJobs.tenantId, tenantId))).for("update");
    if (!job || !["failed", "cancelled"].includes(job.status) || job.attempt >= 3) throw new Error("This render cannot be retried. The maximum is three worker attempts.");
    const spec = renderSpecSchema.parse(job.spec);
    if (spec.source.kind === "theme_package") {
      const [pkg] = await tx.update(contentPackages).set({ status: "pending_review", error: null, updatedAt: new Date(), metrics: sql`coalesce(${contentPackages.metrics}, '{}'::jsonb) || '{"failurePhase":"render_pending"}'::jsonb` })
        .where(and(eq(contentPackages.id, spec.source.id), eq(contentPackages.tenantId, tenantId), inArray(contentPackages.status, ["pending_review", "failed", "rejected"]), sql`${contentPackages.metrics}->>'renderJobId' = ${jobId}`, sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`)).returning({ id: contentPackages.id });
      if (!pkg) throw new Error("This package changed or has been submitted for publishing.");
    }
    await tx.update(mediaRenderJobs).set({ status: "queued", error: null, attemptToken: null, updatedAt: new Date() }).where(eq(mediaRenderJobs.id, job.id));
  });
  await dispatchQueuedRender(jobId);
  return getRender(tenantId, jobId);
}
