'use server';

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";

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
    eq(contentPackages.updatedAt, pkg.updatedAt),
    inArray(contentPackages.status, ["pending_review", "rejected"]),
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
  if (process.env.MEDIA_ENGINE_ENABLED !== "true") throw new Error("The media renderer is not enabled.");
  if (input !== undefined) {
    const timelineInput = z.object({ timeline: timelineSchema, templateFamily: z.enum(["branded_clip", "minimal_meme"]), soundCues: soundCuesSchema.default([]), captions: z.boolean().default(false), musicAssetId: z.uuid().optional() }).strict();
    if (typeof input === "object" && input !== null && "timeline" in input) {
      if (process.env.MEDIA_TIMELINE_ENABLED !== "true") throw new Error("Multi-scene rendering is not enabled.");
      return queueThemeRender(tenantId, packageId, timelineInput.parse(input));
    }
    const settings = z.object({
      mediaAssetId: z.uuid(), insetAssetId: z.uuid().optional(), musicAssetId: z.uuid().optional(),
      templateFamily: z.enum(["branded_clip", "minimal_meme", "photo_headline", "photo_inset"]),
      cropMode: z.enum(["contain", "cover"]), cropX: z.number().min(0).max(1).default(.5), cropY: z.number().min(0).max(1).default(.5), durationSeconds: z.number().min(1).max(60),
      captions: z.boolean().default(false),
      trimStart: z.number().min(0).max(86400), zoom: z.number().min(1).max(1.15),
    }).strict().parse(input);
    const { themeRenderInput } = await import("@/lib/media-engine/theme-adapter");
    const { format } = await themeRenderInput(tenantId, packageId);
    if (format.mediaType === "carousel") throw new Error("Carousel migration is not enabled yet.");
    const video = format.mediaType === "video";
    if (video !== ["branded_clip", "minimal_meme"].includes(settings.templateFamily)) throw new Error("Template does not match the package format.");
    if (settings.templateFamily === "photo_inset" && !settings.insetAssetId) throw new Error("Choose an inset image.");
    for (const id of [settings.mediaAssetId, settings.insetAssetId, settings.musicAssetId].filter(Boolean)) {
      const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, id!), eq(assets.tenantId, tenantId)) });
      if (!asset || !asset.mimeType.startsWith(id === settings.musicAssetId ? "audio/" : id === settings.mediaAssetId && video ? "video/" : "image/")) throw new Error("Choose a matching asset owned by this workspace.");
    }
    return queueThemeRender(tenantId, packageId, settings);
  }
  return queueThemeRender(tenantId, packageId);
}

export async function getThemeRenderSetup(packageId: string) {
  const tenantId = await getActiveTenantId();
  const { themeRenderInput } = await import("@/lib/media-engine/theme-adapter");
  const { format, component } = await themeRenderInput(tenantId, packageId);
  const { assets } = await import("@/lib/db/schema");
  const rows = await db.query.assets.findMany({ where: eq(assets.tenantId, tenantId), columns: { id: true, filename: true, mimeType: true, publicUrl: true }, limit: 100 });
  const savedTimeline = timelineSchema.safeParse(component.timeline);
  const cues = soundCuesSchema.safeParse(component.soundCues);
  return { enabled: process.env.MEDIA_ENGINE_ENABLED === "true" && format.mediaType !== "carousel", timelineEnabled: process.env.MEDIA_TIMELINE_ENABLED === "true" && format.mediaType === "video", sfxEnabled: process.env.MEDIA_SFX_ENABLED === "true", savedSound: { soundCues: cues.success ? cues.data : [], captions: component.captions === true, musicAssetId: typeof component.musicAssetId === "string" ? component.musicAssetId : undefined }, savedTimeline: savedTimeline.success ? savedTimeline.data : undefined, video: format.mediaType === "video", assets: rows.filter(row => row.mimeType.startsWith(format.mediaType === "video" ? "video/" : "image/")), images: rows.filter(row => row.mimeType.startsWith("image/")), music: rows.filter(row => row.mimeType.startsWith("audio/")) };
}
