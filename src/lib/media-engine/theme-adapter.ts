import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, contentPackages, mediaRenderJobs, themeContentFormats, themePages, themeVisualTemplates } from "@/lib/db/schema";
import { getRender, submitRender } from "./engine";
import { dispatchQueuedRender } from "./dispatch";
import type { RenderSpec } from "./spec";

export async function themeRenderInput(tenantId: string, packageId: string, settingsOverride?: Record<string, unknown>) {
  const pkg = await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
  if (!pkg) throw new Error("Package not found.");
  const [page, format, template] = await Promise.all([
    db.query.themePages.findFirst({ where: and(eq(themePages.id, pkg.themePageId), eq(themePages.tenantId, tenantId)) }),
    db.query.themeContentFormats.findFirst({ where: and(eq(themeContentFormats.id, pkg.formatId), eq(themeContentFormats.tenantId, tenantId)) }),
    pkg.templateId ? db.query.themeVisualTemplates.findFirst({ where: and(eq(themeVisualTemplates.id, pkg.templateId), eq(themeVisualTemplates.tenantId, tenantId)) }) : undefined,
  ]);
  if (!page || !format) throw new Error("Theme format unavailable.");
  const settings = settingsOverride ?? (pkg.metrics as { renderSettings?: Record<string, unknown> } | null)?.renderSettings ?? {};
  const component = { ...(template?.componentSpec as Record<string, unknown> ?? {}), ...settings };
  const brand = (page.brandKit ?? {}) as Record<string, unknown>;
  const revision = createHash("sha256").update(JSON.stringify({ title: pkg.title, component, brand, name: page.name, format: format.mediaType })).digest("hex");
  return { pkg, page, format, component, brand, revision };
}

export async function queueThemeRender(tenantId: string, packageId: string, settings?: Record<string, unknown>) {
  const { pkg, page, format, component, brand, revision } = await themeRenderInput(tenantId, packageId, settings);
  if (!["pending_review", "failed", "rejected"].includes(pkg.status) || (pkg.metrics as any)?.publishAttemptAt || (pkg.metrics as any)?.zernioPostId) throw new Error("This package cannot be rendered while publishing or approved.");
  const video = format.mediaType === "video";
  if (format.mediaType === "carousel") throw new Error("Carousel migration is not enabled for this template.");
  async function assetRef(id: unknown, url: unknown) {
    const asset = typeof id === "string" ? await db.query.assets.findFirst({ where: and(eq(assets.id, id), eq(assets.tenantId, tenantId)) })
      : typeof url === "string" ? await db.query.assets.findFirst({ where: and(eq(assets.publicUrl, url), eq(assets.tenantId, tenantId)) }) : undefined;
    if (!asset) throw new Error("Choose an uploaded workspace asset in the template before rendering.");
    return { id: asset.id, version: asset.key };
  }
  const media = await assetRef(component.mediaAssetId, video ? component.videoUrl : component.imageUrl);
  const spec: RenderSpec = {
    version: 1, source: { kind: "theme_package", id: packageId, revision }, templateVersion: 1,
    template: video ? component.templateFamily === "minimal_meme" ? "minimal_meme" : "branded_clip" : component.pipInsetUrl || component.insetAssetId ? "photo_inset" : "photo_headline",
    format: video ? "mp4" : "png", title: pkg.title, media,
    brand: { name: page.name, handle: typeof brand.watermark === "string" ? brand.watermark : "", accent: typeof brand.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(brand.accentColor) ? brand.accentColor : "#ffe633" },
    crop: { mode: component.cropMode === "contain" ? "contain" : component.cropMode === "cover" || !video ? "cover" : "contain", x: Number(component.cropX ?? .5), y: Number(component.cropY ?? .5) },
    ...(video ? { video: { start: Number(component.trimStart ?? 0), duration: Number(component.durationSeconds ?? 15), zoom: Number(component.zoom ?? 1), sourceAudio: true, captions: component.captions === true, words: [] } } : {}),
  };
  if (spec.template === "photo_inset") spec.inset = await assetRef(component.insetAssetId, component.pipInsetUrl);
  if (video && component.musicAssetId) spec.music = await assetRef(component.musicAssetId, undefined);
  // Persist the package ↔ job reference before waking Modal. A short export
  // can otherwise finish before `settleThemeRender` can identify its package.
  const job = await submitRender(tenantId, spec, { dispatch: false });
  const updated = await db.update(contentPackages).set({ renderedAssetUrls: [], status: "pending_review", metrics: sql`coalesce(${contentPackages.metrics}, '{}'::jsonb) || ${JSON.stringify({ ...(settings ? { renderSettings: settings } : {}), renderJobId: job.jobId, renderRevision: revision, failurePhase: "render_pending" })}::jsonb`, error: null, updatedAt: new Date() })
    // PostgreSQL stores microseconds while JavaScript Date carries milliseconds.
    // Keep the optimistic fence, but compare at the precision the caller read.
    .where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId), eq(contentPackages.title, pkg.title), sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${pkg.updatedAt}`, inArray(contentPackages.status, ["pending_review", "failed", "rejected"]), sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`)).returning();
  if (!updated.length) throw new Error("Package changed before rendering was queued.");
  if (job.status === "queued") await dispatchQueuedRender(job.jobId);
  await settleThemeRender(tenantId, packageId);
  return job;
}

export async function settleThemeRender(tenantId: string, packageId: string) {
  const { pkg, revision } = await themeRenderInput(tenantId, packageId);
  const metrics = pkg.metrics as Record<string, unknown>;
  if (typeof metrics?.renderJobId !== "string" || metrics.renderRevision !== revision) return;
  const job = await getRender(tenantId, metrics.renderJobId);
  if (job.status !== "succeeded" && job.status !== "failed" && job.status !== "cancelled") return;
  await db.update(contentPackages).set({
    renderedAssetUrls: job.output ? [{ url: job.output.publicUrl, type: job.output.mimeType === "video/mp4" ? "video" : "image", assetId: job.output.id }] : [],
    error: job.output ? null : job.error || "Render cancelled", status: job.output ? "pending_review" : "failed",
    metrics: sql`coalesce(${contentPackages.metrics}, '{}'::jsonb) || ${JSON.stringify({ failurePhase: job.output ? null : "render" })}::jsonb`, updatedAt: new Date(),
  // `renderJobId` + `renderRevision` are the concurrency fence here. Unlike
  // updatedAt, they remain valid for caption-only changes, which deliberately
  // retain the same rendered pixels. A pixel-affecting edit clears or changes
  // this pair via invalidateThemeMedia, so a late worker completion cannot
  // attach stale output.
  }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId), eq(contentPackages.title, pkg.title), eq(contentPackages.status, "pending_review"), sql`${contentPackages.metrics}->>'renderJobId' = ${job.jobId}`, sql`${contentPackages.metrics}->>'renderRevision' = ${revision}`));
}

export async function assertThemeRenderCurrent(tenantId: string, packageId: string) {
  const { pkg, format, revision } = await themeRenderInput(tenantId, packageId);
  const metrics = pkg.metrics as Record<string, unknown>;
  if (!metrics?.renderJobId) {
    if (format.mediaType === "video" || (Array.isArray(pkg.renderedAssetUrls) && pkg.renderedAssetUrls.some(asset => asset.type === "video"))) throw new Error("Render a finished MP4 before approving or publishing this video.");
    return;
  }
  const job = await getRender(tenantId, String(metrics.renderJobId));
  if (job.status !== "succeeded" || !job.output || metrics.renderRevision !== revision) throw new Error("The media is still rendering or has changed. Render again and review the finished export.");
  const attached = Array.isArray(pkg.renderedAssetUrls) ? pkg.renderedAssetUrls : [];
  if (!attached.some(item => item?.assetId === job.output!.id)) throw new Error("The completed render is not attached to this package yet.");
}

export async function settleCompletedThemeRenders() {
  const rows = await db.select({ tenantId: contentPackages.tenantId, id: contentPackages.id })
    .from(contentPackages).innerJoin(mediaRenderJobs, and(
      eq(mediaRenderJobs.tenantId, contentPackages.tenantId),
      sql`${contentPackages.metrics}->>'renderJobId' = ${mediaRenderJobs.id}`,
    )).where(and(eq(contentPackages.status, "pending_review"),
      sql`${contentPackages.metrics}->>'failurePhase' = 'render_pending'`,
      inArray(mediaRenderJobs.status, ["succeeded", "failed", "cancelled"])))
    .orderBy(contentPackages.updatedAt).limit(50);
  for (const row of rows) await settleThemeRender(row.tenantId, row.id);
}
