'use server';

import { z } from "zod";
import { themeMediaStorageReady } from "@/lib/theme-studio/runtime-readiness";
import { packageMediaCandidates } from "@/lib/theme-studio/source-media";
import { themeRenderSettingsSchema } from "@/lib/theme-studio/design-spec";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getActiveTenantId, getActiveTenantMembership, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { assets, contentPackages, themePages } from "@/lib/db/schema";
import { assertAvailableSchedule, assertSchedulingRole, lockSchedulingAccount } from "@/lib/editorial-scheduling";
import { assertThemeRenderCurrent, queueThemeRender } from "@/lib/media-engine/theme-adapter";
import { publishContentPackage } from "@/lib/theme-studio/publishing/publisher";
import { scoutFactReviewRequired } from "@/lib/scouts/fact-review";
import { timelineSchema } from "@/lib/media-engine/timeline";
import { soundCuesSchema } from "@/lib/media-engine/sound";

export async function reviewThemePackage(
  packageId: string,
  decision: "approve" | "reject",
  feedback?: string,
  factReviewAcknowledged?: { updatedAt: string },
) {
  if (feedback !== undefined && (typeof feedback !== "string" || feedback.length > 5_000)) {
    return { error: "Feedback must be 5,000 characters or fewer." };
  }
  const tenantId = await requireRole(["owner", "admin"]);
  z.enum(["approve", "reject"]).parse(decision);
  const pkg = await db.query.contentPackages.findFirst({
    where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)),
  });
  if (!pkg) return { error: "Content package not found" };
  if (!["pending_review", "rejected"].includes(pkg.status)) {
    return { error: "Only staged or rejected packages can be reviewed" };
  }
  if (decision === "approve") {
    if (scoutFactReviewRequired(pkg.provenance) && factReviewAcknowledged?.updatedAt !== pkg.updatedAt.toISOString()) {
      return { error: "Source claims need human fact review. Open the package in Theme Studio, review the evidence, and acknowledge the uncertainty before approving." };
    }
    try { await assertThemeRenderCurrent(tenantId, packageId); } catch (error) { return { error: error instanceof Error ? error.message : "Render is not ready" }; }
    const assets = Array.isArray(pkg.renderedAssetUrls) ? pkg.renderedAssetUrls : [];
    if (assets.length === 0) return { error: "Render the package media before approval" };
  }

  const applyUpdate = (client: Pick<typeof db, "update">) => client.update(contentPackages).set({
    status: decision === "approve" ? "approved" : "rejected",
    error: decision === "reject" ? (feedback?.trim() || "Rejected by reviewer") : null,
    ...(decision === "approve" && scoutFactReviewRequired(pkg.provenance) ? {
      provenance: { ...(pkg.provenance as Record<string, unknown>), requiresFactReview: false, factReviewAcknowledgedAt: new Date().toISOString() },
    } : {}),
    updatedAt: new Date(),
  }).where(and(
    eq(contentPackages.id, packageId),
    eq(contentPackages.tenantId, tenantId),
    sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${pkg.updatedAt.toISOString()}::timestamp`,
    inArray(contentPackages.status, ["pending_review", "rejected"]),
    eq(contentPackages.title, pkg.title), sql`${contentPackages.caption} IS NOT DISTINCT FROM ${pkg.caption}`,
    sql`${contentPackages.metrics} = ${JSON.stringify(pkg.metrics)}::jsonb`,
    sql`${contentPackages.provenance} = ${JSON.stringify(pkg.provenance)}::jsonb`,
    sql`${contentPackages.renderedAssetUrls} = ${JSON.stringify(pkg.renderedAssetUrls)}::jsonb`,
  )).returning();
  let changed;
  if (decision === "approve" && pkg.scheduledFor) {
    const { tenantId: currentTenant, userId } = await getActiveTenantMembership(["owner", "admin"]);
    if (currentTenant !== tenantId) return { error: "Workspace changed. Refresh before reviewing." };
    try {
      changed = await db.transaction(async tx => {
        const [page] = await tx.select().from(themePages).where(and(eq(themePages.id, pkg.themePageId), eq(themePages.tenantId, tenantId))).for("update");
        const accountIds = Array.isArray(page?.connectedAccounts) ? page.connectedAccounts.filter((id): id is string => typeof id === "string") : [];
        if (!accountIds.length || accountIds.length > 20) throw new Error("Choose active target accounts before scheduling.");
        for (const id of [...new Set(accountIds)].sort()) {
          await lockSchedulingAccount(tx, tenantId, id);
          await assertAvailableSchedule(tx, tenantId, id, pkg.scheduledFor!, pkg.id);
        }
        await assertSchedulingRole(tx, tenantId, userId);
        return applyUpdate(tx);
      });
    } catch { return { error: "The proposed schedule conflicts with another post or its account is unavailable. Review the posting time before approving." }; }
  } else changed = await applyUpdate(db);
  const [updated] = changed;
  return updated ? { package: updated } : { error: "Package changed while it was being reviewed" };
}

export async function publishThemePackage(packageId: string) {
  const tenantId = await requireRole(["owner", "admin"]);
  return publishContentPackage(packageId, tenantId);
}

export async function renderThemePackage(packageId: string, input?: unknown) {
  const tenantId = await requireRole(["owner", "admin", "editor", "member"]);
  const { themeRenderInput } = await import("@/lib/media-engine/theme-adapter");
  const { pkg, format } = await themeRenderInput(tenantId, packageId);
  const video = format.mediaType === "video";
  if (!themeMediaStorageReady()) throw new Error("Connect asset storage and its public delivery URL before creating an export.");
  if (video && process.env.MEDIA_ENGINE_ENABLED !== "true") throw new Error("The video worker is not enabled.");
  if (input !== undefined) {
    const timelineInput = z.object({ timeline: timelineSchema, templateFamily: z.enum(["branded_clip", "minimal_meme"]), soundCues: soundCuesSchema.default([]), captions: z.boolean().default(false), musicAssetId: z.uuid().optional() }).strict();
    if (typeof input === "object" && input !== null && "timeline" in input) {
      if (process.env.MEDIA_TIMELINE_ENABLED !== "true") throw new Error("Multi-scene rendering is not enabled.");
      return queueThemeRender(tenantId, packageId, timelineInput.parse(input));
    }
    const settings = themeRenderSettingsSchema.parse(input);
    if (format.mediaType === "carousel") throw new Error("Carousel migration is not enabled yet.");
    if (video !== ["branded_clip", "minimal_meme"].includes(settings.templateFamily)) throw new Error("Template does not match the package format.");
    if (settings.templateFamily === "photo_inset" && !settings.insetAssetId) throw new Error("Choose an inset image.");
    for (const id of [settings.mediaAssetId, settings.insetAssetId, settings.musicAssetId].filter(Boolean)) {
      const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, id!), eq(assets.tenantId, tenantId)) });
      if (!asset || !asset.mimeType.startsWith(id === settings.musicAssetId ? "audio/" : id === settings.mediaAssetId && video ? "video/" : "image/")) throw new Error("Choose a matching asset owned by this workspace.");
    }
    if (video) return queueThemeRender(tenantId, packageId, settings);
    const photoSettings = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== "templateFamily"));
    const [saved] = await db.update(contentPackages).set({ status: "pending_review", renderedAssetUrls: [], error: null, updatedAt: new Date(), metrics: sql`(coalesce(${contentPackages.metrics}, '{}'::jsonb) - 'renderJobId' - 'renderRevision' - 'legacyRenderRevision' - 'legacyRenderToken') || ${JSON.stringify({ renderSettings: photoSettings, failurePhase: "render_required" })}::jsonb` }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId),
      sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${pkg.updatedAt.toISOString()}::timestamp`,
      inArray(contentPackages.status, ["pending_review", "rejected", "failed"]), sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`,
    )).returning({ id: contentPackages.id });
    if (!saved) throw new Error("Package changed before settings could be saved.");
  }
  if (video) return queueThemeRender(tenantId, packageId);
  const { renderPackageMedia } = await import("@/lib/theme-studio/renderers/media-assembler");
  const result = await renderPackageMedia(packageId, tenantId);
  if (result.queued) return { jobId: "", status: "queued" };
  if (!result.success) throw new Error(result.error || "Media could not be rendered.");
  return { jobId: "", status: "succeeded" };
}

export async function getThemeRenderSetup(packageId: string) {
  const tenantId = await getActiveTenantId();
  const { themeRenderInput } = await import("@/lib/media-engine/theme-adapter");
  const { format, component, pkg } = await themeRenderInput(tenantId, packageId);
  const { assets } = await import("@/lib/db/schema");
  const rows = await db.query.assets.findMany({ where: eq(assets.tenantId, tenantId), columns: { id: true, filename: true, mimeType: true, publicUrl: true }, limit: 100, orderBy: [desc(assets.createdAt)] });
  const savedIds = [component.mediaAssetId, component.insetAssetId, component.musicAssetId].filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value));
  if (savedIds.length) {
    const selectedRows = await db.query.assets.findMany({ where: and(eq(assets.tenantId, tenantId), inArray(assets.id, savedIds)), columns: { id: true, filename: true, mimeType: true, publicUrl: true } });
    for (const row of selectedRows) if (!rows.some(item => item.id === row.id)) rows.push(row);
  }
  const savedTimeline = timelineSchema.safeParse(component.timeline);
  const cues = soundCuesSchema.safeParse(component.soundCues);
  return { timelineEnabled: process.env.MEDIA_TIMELINE_ENABLED === "true" && format.mediaType === "video", sfxEnabled: process.env.MEDIA_SFX_ENABLED === "true", savedSound: { soundCues: cues.success ? cues.data : [], captions: component.captions === true, musicAssetId: typeof component.musicAssetId === "string" ? component.musicAssetId : undefined }, savedTimeline: savedTimeline.success ? savedTimeline.data : undefined, storageReady: themeMediaStorageReady(), aspectRatio: format.aspectRatio, candidates: packageMediaCandidates(pkg.provenance), settings: component, enabled: format.mediaType !== "carousel" && (format.mediaType !== "video" || process.env.MEDIA_ENGINE_ENABLED === "true"), video: format.mediaType === "video", assets: rows.filter(row => row.mimeType.startsWith(format.mediaType === "video" ? "video/" : "image/")), images: rows.filter(row => row.mimeType.startsWith("image/")), music: rows.filter(row => row.mimeType.startsWith("audio/")) };
}

export async function selectThemeSourceMedia(packageId: string, candidateUrl: string) {
  const tenantId = await requireRole(["owner", "admin", "editor", "member"]);
  const { importThemeSourceMedia } = await import("@/lib/theme-studio/import-source-media");
  const asset = await importThemeSourceMedia(tenantId, packageId, candidateUrl);
  return { assetId: asset.id };
}

export async function updateThemePackageCopy(packageId: string, input: unknown) {
  const tenantId = await requireRole(["owner", "admin", "editor", "member"]);
  const copy = z.object({ title: z.string().trim().min(1).max(500), caption: z.string().max(10000), updatedAt: z.iso.datetime() }).strict().parse(input);
  const pkg = await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
  if (!pkg) return { error: "Package not found" };
  const { component, format } = await (await import("@/lib/media-engine/theme-adapter")).themeRenderInput(tenantId, packageId);
  const pixels = copy.title !== pkg.title || ((!(pkg.metrics as any)?.renderJobId || format.mediaType === "image" && Boolean(component.bodyTemplate)) && copy.caption !== pkg.caption);
  const [changed] = await db.update(contentPackages).set({ title: copy.title, caption: copy.caption, status: "pending_review", error: null, updatedAt: new Date(),
    ...(pixels ? { renderedAssetUrls: [], metrics: sql`(coalesce(${contentPackages.metrics}, '{}'::jsonb) - 'renderJobId' - 'renderRevision' - 'legacyRenderRevision' - 'legacyRenderToken') || '{"failurePhase":"render_required"}'::jsonb` } : {}),
  }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId),
    sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${copy.updatedAt}::timestamp`,
    eq(contentPackages.title, pkg.title), sql`${contentPackages.caption} IS NOT DISTINCT FROM ${pkg.caption}`,
    inArray(contentPackages.status, ["pending_review", "approved", "rejected", "failed"]), sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`,
  )).returning({ id: contentPackages.id });
  return changed ? { success: true } : { error: "Package changed or is publishing. Refresh before editing." };
}
