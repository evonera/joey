'use server';

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { assets, contentPackages } from "@/lib/db/schema";
import { assertThemeRenderCurrent, queueThemeRender } from "@/lib/media-engine/theme-adapter";
import { publishContentPackage } from "@/lib/theme-studio/publishing/publisher";

export async function reviewThemePackage(
  packageId: string,
  decision: "approve" | "reject",
  feedback?: string,
) {
  const tenantId = await getActiveTenantId();
  const pkg = await db.query.contentPackages.findFirst({
    where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)),
  });
  if (!pkg) return { error: "Content package not found" };
  if (!["pending_review", "rejected"].includes(pkg.status)) {
    return { error: "Only staged or rejected packages can be reviewed" };
  }
  if (decision === "approve") {
    try { await assertThemeRenderCurrent(tenantId, packageId); } catch (error) { return { error: error instanceof Error ? error.message : "Render is not ready" }; }
    const assets = Array.isArray(pkg.renderedAssetUrls) ? pkg.renderedAssetUrls : [];
    if (assets.length === 0) return { error: "Render the package media before approval" };
  }

  const [updated] = await db.update(contentPackages).set({
    status: decision === "approve" ? "approved" : "rejected",
    error: decision === "reject" ? (feedback?.trim() || "Rejected by reviewer") : null,
    updatedAt: new Date(),
  }).where(and(
    eq(contentPackages.id, packageId),
    eq(contentPackages.tenantId, tenantId),
    eq(contentPackages.updatedAt, pkg.updatedAt),
    inArray(contentPackages.status, ["pending_review", "rejected"]),
  )).returning();
  return updated ? { package: updated } : { error: "Package changed while it was being reviewed" };
}

export async function publishThemePackage(packageId: string) {
  const tenantId = await getActiveTenantId();
  return publishContentPackage(packageId, tenantId);
}

export async function renderThemePackage(packageId: string, input?: unknown) {
  const tenantId = await getActiveTenantId();
  if (process.env.MEDIA_ENGINE_ENABLED !== "true") throw new Error("The media renderer is not enabled.");
  if (input !== undefined) {
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
  const { format } = await themeRenderInput(tenantId, packageId);
  const { assets } = await import("@/lib/db/schema");
  const rows = await db.query.assets.findMany({ where: eq(assets.tenantId, tenantId), columns: { id: true, filename: true, mimeType: true, publicUrl: true }, limit: 100 });
  return { enabled: process.env.MEDIA_ENGINE_ENABLED === "true" && format.mediaType !== "carousel", video: format.mediaType === "video", assets: rows.filter(row => row.mimeType.startsWith(format.mediaType === "video" ? "video/" : "image/")), images: rows.filter(row => row.mimeType.startsWith("image/")), music: rows.filter(row => row.mimeType.startsWith("audio/")) };
}
