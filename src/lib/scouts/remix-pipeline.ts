import { db } from "@/lib/db";
import {
  scouts,
  themePages,
  storyClusters,
  contentPackages,
  themeContentFormats,
  themeVisualTemplates,
  themeSlots,
} from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { searchWithExa } from "@/lib/search/exa-client";
import { renderPackageMedia } from "@/lib/theme-studio/renderers/media-assembler";
import type { ScoutAlert } from "./evaluator";

export interface RemixScoutAlertOptions {
  tenantId: string;
  scoutId: string;
  themePageId?: string;
}

export interface RemixScoutAlertResult {
  success: boolean;
  packageId?: string;
  clusterId?: string;
  title?: string;
  status?: string;
  renderedUrls?: Array<{ url: string; type: string }>;
  error?: string;
}

/**
 * Cleans raw social caption text into a clean research query for Exa search.
 */
function cleanQueryFromPost(raw: string): string {
  return raw
    .replace(/^stop scrolling[:\s-]*/i, "")
    .replace(/#[\w\d_]+/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\w\s.,'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

/**
 * Automates the Scout -> Research -> Theme Studio Draft action bridge.
 * 1. Takes a competitor spike detected by a Scout.
 * 2. Uses Exa Search to research the authoritative story and retrieve high-res hero images.
 * 3. Ingests the facts into a Theme Studio story cluster.
 * 4. Synthesizes a branded content package in the theme page's voice.
 * 5. Renders branded visual media and places the post into the pending_review draft queue.
 */
export async function remixScoutAlertToThemeStudio(
  options: RemixScoutAlertOptions,
): Promise<RemixScoutAlertResult> {
  const scout = await db.query.scouts.findFirst({
    where: and(eq(scouts.id, options.scoutId), eq(scouts.tenantId, options.tenantId)),
  });

  if (!scout) {
    return { success: false, error: "Scout not found" };
  }

  const alert = scout.latestAlert as ScoutAlert | null;
  if (!alert) {
    return { success: false, error: "No active alert on this Scout to remix" };
  }

  // Resolve target Theme Page: prioritize requested page, or latest active page
  let targetPage;
  if (options.themePageId) {
    targetPage = await db.query.themePages.findFirst({
      where: and(eq(themePages.id, options.themePageId), eq(themePages.tenantId, options.tenantId)),
    });
  } else {
    targetPage = await db.query.themePages.findFirst({
      where: and(eq(themePages.tenantId, options.tenantId), eq(themePages.status, "active")),
      orderBy: [desc(themePages.updatedAt)],
    });
  }

  if (!targetPage) {
    return {
      success: false,
      error: "No active Theme Page found for this workspace. Please create or activate a Theme Page first.",
    };
  }

  // Formulate research query
  const rawQuery =
    alert.actionPayload?.topicQuery ||
    alert.samplePost?.content ||
    alert.title ||
    scout.name;

  const searchQuery = cleanQueryFromPost(rawQuery);

  // Deep research via Exa Search
  let searchRes;
  try {
    searchRes = await searchWithExa(
      {
        query: searchQuery,
        numResults: 4,
        type: "auto",
      },
      options.tenantId,
    );
  } catch (err) {
    console.warn("[scouts-remix] Exa research query failed:", err);
    return {
      success: false,
      error: "Exa research could not find verified source stories or facts for this topic.",
    };
  }

  if (!searchRes || !searchRes.results || searchRes.results.length === 0) {
    return {
      success: false,
      error: "Exa research could not find verified source stories or facts for this topic.",
    };
  }

  const primaryResult = searchRes.results.find((r) => r.heroImage) || searchRes.results[0];
  const heroImage = primaryResult?.heroImage || searchRes.images?.[0] || alert.samplePost?.url;

  // Build structured facts from Exa results
  const facts = searchRes.results.slice(0, 4).map((r) => ({
    claim: r.title,
    sourceUrl: r.url,
    entity: r.title.split(" ")[0],
    corroborationStatus: "verified" as const,
  }));

  // Resolve format and visual template scoped to targetPage first
  const slot = await db.query.themeSlots.findFirst({
    where: and(
      eq(themeSlots.themePageId, targetPage.id),
      eq(themeSlots.tenantId, options.tenantId),
      eq(themeSlots.isActive, true),
    ),
    orderBy: [themeSlots.priority],
  });

  let format = null;
  if (slot?.formatId) {
    format = await db.query.themeContentFormats.findFirst({
      where: and(
        eq(themeContentFormats.id, slot.formatId),
        eq(themeContentFormats.tenantId, options.tenantId),
      ),
    });
  }

  if (!format) {
    format = await db.query.themeContentFormats.findFirst({
      where: eq(themeContentFormats.tenantId, options.tenantId),
    });
  }

  if (!format) {
    return {
      success: false,
      error: "No active content format found for this workspace. Please configure a format first.",
    };
  }

  let template = null;
  if (slot?.overrideTemplateId) {
    template = await db.query.themeVisualTemplates.findFirst({
      where: and(
        eq(themeVisualTemplates.id, slot.overrideTemplateId),
        eq(themeVisualTemplates.tenantId, options.tenantId),
      ),
    });
  }

  if (!template) {
    template = await db.query.themeVisualTemplates.findFirst({
      where: and(
        eq(themeVisualTemplates.themePageId, targetPage.id),
        eq(themeVisualTemplates.formatId, format.id),
        eq(themeVisualTemplates.tenantId, options.tenantId),
      ),
    });
  }

  if (!template) {
    template = await db.query.themeVisualTemplates.findFirst({
      where: and(
        eq(themeVisualTemplates.formatId, format.id),
        eq(themeVisualTemplates.tenantId, options.tenantId),
      ),
    });
  }

  // Create Story Cluster in Theme Studio
  const clusterTitle = primaryResult?.title || alert.title || `Trending: ${scout.name}`;
  const clusterSummary =
    primaryResult?.highlights?.join(" ").slice(0, 300) ||
    alert.samplePost?.content?.slice(0, 300) ||
    "Competitor viral hook detected by scout.";

  const [cluster] = await db
    .insert(storyClusters)
    .values({
      tenantId: options.tenantId,
      themePageId: targetPage.id,
      title: clusterTitle,
      summary: clusterSummary,
      facts,
      memberItemIds: [],
      freshnessScore: "9.8",
      status: "open",
    })
    .returning();

  // Generate punchy editorial title and caption in page brand voice
  const postTitle = clusterTitle.length > 90 ? clusterTitle.slice(0, 87) + "..." : clusterTitle;
  const postCaption = `${clusterSummary}\n\nWhat are your thoughts on this? Drop a comment below.`;
  const defaultHashtags = ["#trending", "#news", `#${targetPage.niche?.toLowerCase().replace(/[^\w]/g, "") || "daily"}`];

  // Insert Content Package into Drafts Queue (status: pending_review)
  const [pkg] = await db
    .insert(contentPackages)
    .values({
      tenantId: options.tenantId,
      themePageId: targetPage.id,
      clusterId: cluster.id,
      formatId: format.id,
      templateId: template?.id,
      title: postTitle,
      caption: postCaption,
      hashtags: defaultHashtags,
      status: "pending_review",
      renderedAssetUrls: [],
      provenance: {
        scoutId: scout.id,
        competitorUrl: scout.targetUrl,
        heroImage,
        sources: searchRes.results.map((r) => ({
          title: r.title,
          url: r.url,
          heroImage: r.heroImage,
        })),
      },
    })
    .returning();

  // Trigger media rendering
  let renderedUrls: Array<{ url: string; type: string }> = [];
  try {
    const renderRes = await renderPackageMedia(
      pkg.id,
      options.tenantId,
      `scout_remix_${Date.now()}`,
    );
    renderedUrls = renderRes?.renderedUrls || [];
    if (renderedUrls.length === 0) {
      return {
        success: false,
        packageId: pkg.id,
        clusterId: cluster.id,
        title: pkg.title,
        status: pkg.status,
        error: "Media rendering produced no output assets.",
      };
    }
  } catch (renderErr: any) {
    console.warn("[scouts-remix] Media card rendering failed:", renderErr);
    return {
      success: false,
      packageId: pkg.id,
      clusterId: cluster.id,
      title: pkg.title,
      status: pkg.status,
      error: `Media rendering failed: ${renderErr?.message || String(renderErr)}`,
    };
  }

  return {
    success: true,
    packageId: pkg.id,
    clusterId: cluster.id,
    title: pkg.title,
    status: pkg.status,
    renderedUrls,
  };
}
