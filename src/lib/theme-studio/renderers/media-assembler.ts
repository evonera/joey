import { db } from "@/lib/db";
import { assets, contentPackages, storyClusters, themePages, themeContentFormats, themeVisualTemplates } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { renderCardSvg, renderCarouselSlideSvgs } from "./static-card-renderer";
import { uploadAndRegisterFlowAsset } from "@/lib/flows/asset-registration";
import { Resvg } from "@resvg/resvg-js";

export interface RenderPackageResult {
  packageId: string;
  mediaType: string;
  renderedUrls: Array<{ url: string; type: string; slideIndex?: number }>;
  success: boolean;
  error?: string;
}

/**
 * Renders branded media assets for a content package and stores them in Cloudflare R2.
 */
function pngBuffer(svg: string): Buffer {
  return Buffer.from(new Resvg(svg, {
    background: "rgba(0, 0, 0, 0)",
    font: { loadSystemFonts: true },
  }).render().asPng());
}

function existingRenderedUrls(value: unknown): Array<{ url: string; type: string; slideIndex?: number }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { url: string; type: string; slideIndex?: number } => (
    Boolean(item) && typeof item === "object" && typeof item.url === "string" && item.url.startsWith("https://")
  ));
}

function applyTemplate(value: unknown, fallback: string, tokens: Record<string, string>): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.replace(/\{\{([a-z_]+)\}\}/gi, (match, key: string) => tokens[key] ?? match);
}

export async function renderPackageMedia(
  packageId: string,
  tenantId: string,
  flowRunId: string,
  signal?: AbortSignal,
  heartbeat?: () => Promise<void> | void,
): Promise<RenderPackageResult> {
  const pkg = await db.query.contentPackages.findFirst({
    where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)),
  });
  if (!pkg) throw new Error("Content package not found");

  const page = await db.query.themePages.findFirst({
    where: and(eq(themePages.id, pkg.themePageId), eq(themePages.tenantId, tenantId)),
  });

  const format = await db.query.themeContentFormats.findFirst({
    where: and(eq(themeContentFormats.id, pkg.formatId), eq(themeContentFormats.tenantId, tenantId)),
  });

  if (!page || !format) {
    return { packageId, mediaType: "unknown", renderedUrls: [], success: false, error: "Theme page or format not found" };
  }
  const alreadyRendered = existingRenderedUrls(pkg.renderedAssetUrls);
  if (alreadyRendered.length > 0) {
    return { packageId, mediaType: format.mediaType, renderedUrls: alreadyRendered, success: true };
  }

  const template = pkg.templateId ? await db.query.themeVisualTemplates.findFirst({
    where: and(
      eq(themeVisualTemplates.id, pkg.templateId),
      eq(themeVisualTemplates.tenantId, tenantId),
    ),
  }) : undefined;
  const templateSpec = template?.componentSpec && typeof template.componentSpec === "object"
    ? template.componentSpec as Record<string, unknown>
    : {};
  const pageBrandKit = page.brandKit && typeof page.brandKit === "object"
    ? page.brandKit as Record<string, unknown>
    : {};
  const brandKit = {
    ...pageBrandKit,
    ...(typeof templateSpec.backgroundColor === "string" ? { primaryColor: templateSpec.backgroundColor } : {}),
    ...(typeof templateSpec.accentColor === "string" ? { accentColor: templateSpec.accentColor } : {}),
    ...(typeof templateSpec.textColor === "string" ? { textColor: templateSpec.textColor } : {}),
    ...(typeof templateSpec.fontFamily === "string" ? { fontFamily: templateSpec.fontFamily } : {}),
    ...(typeof templateSpec.titleSize === "number" ? { titleSize: templateSpec.titleSize } : {}),
    ...(typeof templateSpec.bodySize === "number" ? { bodySize: templateSpec.bodySize } : {}),
    ...(typeof templateSpec.showWatermark === "boolean" ? { showWatermark: templateSpec.showWatermark } : {}),
    ...(templateSpec.showWatermark !== false && typeof templateSpec.watermarkText === "string"
      ? { watermark: templateSpec.watermarkText }
      : {}),
  };
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
    date: new Date().toISOString().slice(0, 10),
  };
  const renderedTitle = applyTemplate(templateSpec.titleTemplate, pkg.title, templateTokens);
  const renderedBody = applyTemplate(templateSpec.bodyTemplate, pkg.caption || "", templateTokens);

  const renderedUrls: Array<{ url: string; type: string; slideIndex?: number }> = [];

  async function storePng(svg: string, key: string, filename: string): Promise<string> {
    signal?.throwIfAborted();
    await heartbeat?.();
    const existing = await db.query.assets.findFirst({
      where: and(eq(assets.tenantId, tenantId), eq(assets.key, key)),
      columns: { publicUrl: true },
    });
    if (existing) return existing.publicUrl;
    const body = pngBuffer(svg);
    const registered = await uploadAndRegisterFlowAsset({
      tenantId,
      runId: flowRunId,
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

  try {
    if (format?.mediaType === "carousel") {
      const cluster = pkg.clusterId ? await db.query.storyClusters.findFirst({
        where: and(eq(storyClusters.id, pkg.clusterId), eq(storyClusters.tenantId, tenantId)),
      }) : undefined;
      const facts = Array.isArray(cluster?.facts)
        ? cluster.facts.filter((fact): fact is { claim: string } => (
            Boolean(fact) && typeof fact === "object" && "claim" in fact && typeof fact.claim === "string"
          )).slice(0, 3)
        : [];
      const slides = [
        { title: renderedTitle, body: renderedBody.slice(0, 200), tag: "COVER" },
        ...facts.map((fact, index) => ({
          title: `Sourced point ${index + 1}`,
          body: fact.claim,
          tag: `POINT ${index + 1}`,
        })),
      ];

      const svgSlides = renderCarouselSlideSvgs(slides, brandKit);

      for (let i = 0; i < svgSlides.length; i++) {
        const svg = svgSlides[i];
        const publicUrl = await storePng(
          svg,
          `${pkg.tenantId}/theme-studio/${pkg.id}/slide_${i + 1}.png`,
          `${pkg.title} slide ${i + 1}.png`,
        );
        renderedUrls.push({ url: publicUrl, type: "image", slideIndex: i + 1 });
      }
    } else if (format?.mediaType === "video") {
      const message = "Video preview is available, but an MP4 render worker has not been configured";
      await db.update(contentPackages).set({
        status: "failed",
        error: message,
        updatedAt: new Date(),
      }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)));
      return {
        packageId,
        mediaType: "video",
        renderedUrls: [],
        success: false,
        error: message,
      };
    } else {
      // Standard static image card
      const svg = renderCardSvg({
        title: renderedTitle,
        body: renderedBody.slice(0, 240),
        tag: "UPDATE",
        sourceName,
        brandKit,
        aspectRatio: (format?.aspectRatio as any) || "1:1",
      });

      const publicUrl = await storePng(
        svg,
        `${pkg.tenantId}/theme-studio/${pkg.id}/card.png`,
        `${pkg.title}.png`,
      );
      renderedUrls.push({ url: publicUrl, type: "image" });
    }

    await db
      .update(contentPackages)
      .set({
        renderedAssetUrls: renderedUrls,
        updatedAt: new Date(),
      })
      .where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)));

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
      updatedAt: new Date(),
    }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)));
    return {
      packageId,
      mediaType: format?.mediaType || "image",
      renderedUrls: [],
      success: false,
      error: message,
    };
  }
}
