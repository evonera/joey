import { themeMediaStorageReady } from "../runtime-readiness";
import { db } from "@/lib/db";
import { assets, contentPackages, themePages, themeContentFormats, storyClusters } from "@/lib/db/schema";
import { randomUUID } from "node:crypto";
import { legacyThemeRenderInput } from "@/lib/media-engine/legacy-theme-input";
import { and, eq, inArray, sql } from "drizzle-orm";
import { designBrandKit, renderStaticThemeSvgs } from "./static-theme";
import { applyDesignCopy } from "../template-copy";
import { uploadAndRegisterFlowAsset } from "@/lib/flows/asset-registration";
import { renderSvgPng } from "./rasterize-svg";
import { scoutRenderableFacts } from "@/lib/scouts/fact-review";

export interface RenderPackageResult {
  packageId: string;
  mediaType: string;
  renderedUrls: Array<{ url: string; type: string; slideIndex?: number }>;
  success: boolean;
  queued?: boolean;
  error?: string;
}

/**
 * Renders branded media assets for a content package and stores them in Cloudflare R2.
 */
function existingRenderedUrls(value: unknown): Array<{ url: string; type: string; slideIndex?: number }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { url: string; type: string; slideIndex?: number } => (
    Boolean(item) && typeof item === "object" && typeof item.url === "string" && item.url.startsWith("https://")
  ));
}

export async function renderPackageMedia(
  packageId: string,
  tenantId: string,
  flowRunId?: string,
  signal?: AbortSignal,
  heartbeat?: () => Promise<void> | void,
  operations: { rasterize?: typeof renderSvgPng; upload?: typeof uploadAndRegisterFlowAsset; preserveReviewDecision?: boolean } = {},
): Promise<RenderPackageResult> {
  const options = operations;
  let pkg = await db.query.contentPackages.findFirst({
    where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)),
  });
  if (!pkg) throw new Error("Content package not found");
  if (options.preserveReviewDecision && !["pending_review", "failed"].includes(pkg.status)) {
    return { packageId, mediaType: "unknown", renderedUrls: [], success: false, error: "This package is no longer an editable draft." };
  }
  const draftFence = options.preserveReviewDecision ? and(
    inArray(contentPackages.status, ["pending_review", "failed"]),
    sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${pkg.updatedAt.toISOString()}::timestamp`,
    sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`,
    sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`,
  ) : undefined;

  let page = await db.query.themePages.findFirst({
    where: and(eq(themePages.id, pkg.themePageId), eq(themePages.tenantId, tenantId)),
  });

  let format = await db.query.themeContentFormats.findFirst({
    where: and(eq(themeContentFormats.id, pkg.formatId), eq(themeContentFormats.tenantId, tenantId)),
  });

  if (!page || !format) {
    return { packageId, mediaType: "unknown", renderedUrls: [], success: false, error: "Theme page or format not found" };
  }
  if (!operations.upload && !themeMediaStorageReady()) return { packageId, mediaType: format.mediaType, renderedUrls: [], success: false, error: "Connect asset storage and its public delivery URL before creating an export." };
  const { packageMediaCandidates, IMPORTABLE_MEDIA_RIGHTS } = await import("../source-media");
  const candidate = packageMediaCandidates(pkg.provenance).find(item => IMPORTABLE_MEDIA_RIGHTS.has(item.rightsCategory));
  if (candidate) {
    const { themeRenderInput } = await import("@/lib/media-engine/theme-adapter");
    const { component } = await themeRenderInput(tenantId, packageId);
    if (!component.mediaAssetId && !component.bgImageUrl && component.bgType !== "solid" && component.bgType !== "gradient") {
      const { importThemeSourceMedia } = await import("../import-source-media");
      try { await importThemeSourceMedia(tenantId, packageId, candidate.url, signal); }
      catch (error) { return { packageId, mediaType: format.mediaType, renderedUrls: [], success: false, error: error instanceof Error ? error.message : "Source media import failed" }; }
      pkg = (await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) }))!;
    }
  }
  if (process.env.MEDIA_ENGINE_ENABLED === "true" && format.mediaType === "video") {
    const { queueThemeRender } = await import("@/lib/media-engine/theme-adapter");
    try {
      signal?.throwIfAborted();
      const job = await queueThemeRender(tenantId, packageId, undefined, options);
      return { packageId, mediaType: format.mediaType, renderedUrls: [], success: false, queued: job.status === "queued" || job.status === "rendering" || job.status === "succeeded" };
    } catch (error) { return { packageId, mediaType: format.mediaType, renderedUrls: [], success: false, error: error instanceof Error ? error.message : "Render submission failed" }; }
  }
  if (format.mediaType === "video") return { packageId, mediaType: "video", renderedUrls: [], success: false, error: "Enable the media worker to render a finished MP4. Raw source clips are not publishable exports." };
  const snapshot = await legacyThemeRenderInput(tenantId, packageId);
  const { revision, cluster } = snapshot;
  pkg = snapshot.pkg; page = snapshot.page; format = snapshot.format;
  const insetAsset = typeof snapshot.component.insetAssetId === "string" ? await db.query.assets.findFirst({ where: and(eq(assets.id, snapshot.component.insetAssetId), eq(assets.tenantId, tenantId)) }) : undefined;
  const templateSpec: Record<string, unknown> = { ...snapshot.component, ...(snapshot.component.insetEnabled === false ? { pipInsetUrl: undefined } : insetAsset ? { pipInsetUrl: insetAsset.publicUrl } : {}) };
  const priorMetrics = pkg.metrics && typeof pkg.metrics === "object" && !Array.isArray(pkg.metrics)
    ? pkg.metrics as Record<string, unknown> : {};
  const alreadyRendered = existingRenderedUrls(pkg.renderedAssetUrls);
  if (alreadyRendered.length > 0 && priorMetrics.legacyRenderRevision === revision) {
    return { packageId, mediaType: format.mediaType, renderedUrls: alreadyRendered, success: true };
  }
  if (priorMetrics.failurePhase === "render_pending" && priorMetrics.legacyRenderRevision === revision && typeof priorMetrics.legacyRenderToken === "string" && pkg.updatedAt.getTime() > Date.now() - 600000) return { packageId, mediaType: format.mediaType, renderedUrls: [], success: false, queued: true };
  const token = randomUUID();
  const [claimed] = await db.update(contentPackages).set({
    status: "pending_review", renderedAssetUrls: [], error: null, updatedAt: new Date(),
    metrics: sql`(coalesce(${contentPackages.metrics}, '{}'::jsonb) - 'renderJobId' - 'renderRevision') || ${JSON.stringify({ legacyRenderRevision: revision, legacyRenderToken: token, failurePhase: "render_pending" })}::jsonb`,
  }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId),
    sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${pkg.updatedAt.toISOString()}::timestamp`,
    inArray(contentPackages.status, options.preserveReviewDecision ? ["pending_review", "failed"] : ["pending_review", "rejected", "failed"]),
    draftFence,
    sql`NOT (coalesce(${contentPackages.metrics}->>'failurePhase', '') = 'render_pending' AND coalesce(${contentPackages.metrics}->>'legacyRenderRevision', '') = ${revision} AND ${contentPackages.updatedAt} > now() - interval '10 minutes')`,
    sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`,
  )).returning({ id: contentPackages.id });
  if (!claimed) return { packageId, mediaType: format.mediaType, renderedUrls: [], success: false, error: "Package changed before rendering started." };
  const completionFence = and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId),
    eq(contentPackages.status, "pending_review"), sql`${contentPackages.metrics}->>'legacyRenderRevision' = ${revision}`,
    sql`${contentPackages.metrics}->>'legacyRenderToken' = ${token}`, eq(contentPackages.title, pkg.title),
    sql`${contentPackages.caption} IS NOT DISTINCT FROM ${pkg.caption}`,
    sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`);
  const pageBrandKit = page.brandKit && typeof page.brandKit === "object"
    ? page.brandKit as Record<string, unknown>
    : {};
  const brandKit = designBrandKit(pageBrandKit, templateSpec);
  const provenance = pkg.provenance && typeof pkg.provenance === "object"
    ? pkg.provenance as Record<string, unknown>
    : {};
  const provenanceSources = Array.isArray(provenance.sources) ? provenance.sources : [];
  const firstSource = provenanceSources[0] && typeof provenanceSources[0] === "object"
    ? provenanceSources[0] as Record<string, unknown>
    : {};
  let sourceName = "Source in caption";
  if (typeof firstSource.url === "string") {
    try { sourceName = new URL(firstSource.url).hostname; } catch {}
  }
  const templateTokens = {
    title: pkg.title,
    summary: pkg.caption || "",
    source_name: sourceName,
    author: "",
    tag: "UPDATE",
    date: typeof firstSource.publishedAt === "string" ? firstSource.publishedAt.slice(0, 10) : pkg.createdAt.toISOString().slice(0, 10),
  };
  const renderedTitle = applyDesignCopy(templateSpec.titleTemplate, pkg.title, templateTokens);
  const renderedBody = applyDesignCopy(templateSpec.bodyTemplate, pkg.caption || "", templateTokens);

  const renderedUrls: Array<{ url: string; type: string; slideIndex?: number }> = [];
  const imageCache = new Map<string, Buffer>();

  async function storePng(svg: string, key: string, filename: string): Promise<string> {
    signal?.throwIfAborted();
    await heartbeat?.();
    const existing = await db.query.assets.findFirst({
      where: and(eq(assets.tenantId, tenantId), eq(assets.key, key)),
      columns: { publicUrl: true },
    });
    if (existing) return existing.publicUrl;
    const body = await (operations.rasterize ?? renderSvgPng)(svg, signal, imageCache);
    const registered = await (operations.upload ?? uploadAndRegisterFlowAsset)({
      tenantId,
      runId: flowRunId,
      sourcePackageId: packageId,
      key,
      filename,
      mimeType: "image/png",
      body,
      signal,
      reason: "Theme Studio render pending asset registration",
    });
    await heartbeat?.();
    return registered.publicUrl;
  }

  const selectedAsset = typeof templateSpec.mediaAssetId === "string" ? await db.query.assets.findFirst({ where: and(eq(assets.id, templateSpec.mediaAssetId), eq(assets.tenantId, tenantId)) }) : undefined;
  const heroImage = (
    (templateSpec.bgType !== "solid" && templateSpec.bgType !== "gradient" ? selectedAsset?.publicUrl : undefined) ||
    (typeof templateSpec.bgImageUrl === "string" && templateSpec.bgImageUrl) ||
    (templateSpec.bgType !== "solid" && templateSpec.bgType !== "gradient" && !provenance.scoutId && IMPORTABLE_MEDIA_RIGHTS.has(String(firstSource.rightsCategory)) && typeof firstSource.heroImage === "string" && firstSource.heroImage) ||
    (templateSpec.bgType !== "solid" && templateSpec.bgType !== "gradient" && !provenance.scoutId && IMPORTABLE_MEDIA_RIGHTS.has(String(provenance.rightsCategory)) && typeof (provenance as any).heroImage === "string" && (provenance as any).heroImage) ||
    (!provenance.scoutId && IMPORTABLE_MEDIA_RIGHTS.has(String((pkg as any).metadata?.rightsCategory)) && typeof (pkg as any).metadata?.heroImage === "string" && (pkg as any).metadata?.heroImage) ||
    undefined
  );

  try {
    const facts = scoutRenderableFacts(cluster?.facts, provenance);
    const svgSlides = renderStaticThemeSvgs({ component: templateSpec, brandKit, title: renderedTitle, body: renderedBody, sourceName, pageName: page.name, heroImage, mediaType: format.mediaType, slug: format.slug, aspectRatio: format.aspectRatio, facts });
    for (let i = 0; i < svgSlides.length; i++) {
      const url = await storePng(svgSlides[i], `${tenantId}/theme-studio/${pkg.id}/${revision}/${token}/card_${i + 1}.png`, `${pkg.title}${svgSlides.length > 1 ? ` slide ${i + 1}` : ""}.png`);
      renderedUrls.push({ url, type: "image", ...(svgSlides.length > 1 ? { slideIndex: i + 1 } : {}) });
    }

    const current = await legacyThemeRenderInput(tenantId, packageId);
    if (current.revision !== revision) throw new Error("Package design changed while rendering. Render the current version again.");
    const [attached] = await db
      .update(contentPackages)
      .set({
        renderedAssetUrls: renderedUrls,
        status: "pending_review",
        error: null,
        metrics: sql`coalesce(${contentPackages.metrics}, '{}'::jsonb) || '{"failurePhase":null}'::jsonb`,
        updatedAt: new Date(),
      })
      .where(completionFence).returning({ id: contentPackages.id });
    if (!attached) throw new Error("Package changed while rendering. Export was not attached.");

    return {
      packageId,
      mediaType: format?.mediaType || "image",
      renderedUrls,
      success: true,
    };
  } catch (err: any) {
    const message = err.message || "Failed to render package media";
    await db.update(contentPackages).set({
      status: "failed",
      error: message,
      metrics: sql`coalesce(${contentPackages.metrics}, '{}'::jsonb) || '{"failurePhase":"render"}'::jsonb`,
      updatedAt: new Date(),
    }).where(completionFence);
    signal?.throwIfAborted();
    return {
      packageId,
      mediaType: format?.mediaType || "image",
      renderedUrls: [],
      success: false,
      error: message,
    };
  }
}
