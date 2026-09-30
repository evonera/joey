import { db } from "@/lib/db";
import {
  scouts,
  themePages,
  contentPackages,
  themeContentFormats,
  themeVisualTemplates,
  themeSlots,
  scoutRemixes,
} from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { searchWithExa } from "@/lib/search/exa-client";
import { renderPackageMedia } from "@/lib/theme-studio/renderers/media-assembler";
import type { ScoutAlert } from "./evaluator";
import { claimScoutRemix, finishScoutRemix, saveScoutRemixDraft, scoutRemixEventKey } from "./remix-receipts";
import { synthesizeScoutResearch } from "./remix-research";

export interface RemixScoutAlertOptions {
  tenantId: string;
  scoutId: string;
  themePageId?: string;
  signal?: AbortSignal;
}

export interface RemixScoutAlertResult {
  success: boolean;
  packageId?: string;
  clusterId?: string;
  title?: string;
  status?: string;
  renderedUrls?: Array<{ url: string; type: string }>;
  error?: string;
  renderState?: "processing" | "not_started" | "queued" | "completed" | "failed";
  duplicate?: boolean;
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
export async function remixScoutAlertToThemeStudio(options: RemixScoutAlertOptions): Promise<RemixScoutAlertResult> {
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

  const { claimed, receipt } = await claimScoutRemix({
    tenantId: options.tenantId,
    scoutId: scout.id,
    themePageId: targetPage.id,
    eventKey: scoutRemixEventKey(scout.targetUrl, scout.goalCondition, alert),
  });
  if (!claimed) {
    const existing = receipt.packageId
      ? await db.query.contentPackages.findFirst({
          where: and(eq(contentPackages.id, receipt.packageId), eq(contentPackages.tenantId, options.tenantId)),
        })
      : undefined;
    const outputs = Array.isArray(existing?.renderedAssetUrls)
      ? (existing.renderedAssetUrls as Array<{ url: string; type: string }>)
      : [];
    const completed = outputs.length > 0;
    const failed = !completed && (existing?.status === "failed" || receipt.status === "failed");
    return {
      success: !failed,
      duplicate: true,
      packageId: existing?.id,
      clusterId: receipt.clusterId ?? undefined,
      title: existing?.title,
      status: existing?.status,
      renderedUrls: outputs,
      renderState: completed
        ? "completed"
        : failed
          ? "failed"
          : receipt.status === "queued"
            ? "queued"
            : existing
              ? "not_started"
              : "processing",
      ...(failed && receipt.error ? { error: receipt.error } : {}),
    };
  }
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(180_000)])
    : AbortSignal.timeout(180_000);
  try {
    signal.throwIfAborted();

    // Formulate research query
    const rawQuery = alert.actionPayload?.topicQuery || alert.samplePost?.content || alert.title || scout.name;

    const searchQuery = cleanQueryFromPost(rawQuery);

    // Deep research via Exa Search
    let searchRes;
    try {
      searchRes = await searchWithExa(
        {
          query: searchQuery,
          numResults: 4,
          type: "auto",
          signal,
        },
        options.tenantId
      );
    } catch (err) {
      console.warn("[scouts-remix] Exa research query failed:", err);
      return {
        success: false,
        error: "Research search failed. Try again after checking the Exa integration.",
      };
    }

    if (!searchRes || !searchRes.results || searchRes.results.length === 0) {
      return {
        success: false,
        error: "Research found no source stories for this topic.",
      };
    }

    const primaryResult = searchRes.results.find((r) => r.heroImage) || searchRes.results[0];
    // Research images are references, not licenses. Do not attach a competitor
    // post URL or an unlicensed search image as the draft's renderable media.
    const heroImageReference = primaryResult?.heroImage || searchRes.images?.[0];

    // Resolve format and visual template scoped to targetPage first
    const slot = await db.query.themeSlots.findFirst({
      where: and(
        eq(themeSlots.themePageId, targetPage.id),
        eq(themeSlots.tenantId, options.tenantId),
        eq(themeSlots.isActive, true)
      ),
      orderBy: [themeSlots.priority],
    });

    let format = null;
    if (slot?.formatId) {
      format = await db.query.themeContentFormats.findFirst({
        where: and(eq(themeContentFormats.id, slot.formatId), eq(themeContentFormats.tenantId, options.tenantId)),
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
          eq(themeVisualTemplates.tenantId, options.tenantId)
        ),
      });
    }

    if (!template) {
      template = await db.query.themeVisualTemplates.findFirst({
        where: and(
          eq(themeVisualTemplates.themePageId, targetPage.id),
          eq(themeVisualTemplates.formatId, format.id),
          eq(themeVisualTemplates.tenantId, options.tenantId)
        ),
      });
    }

    if (!template) {
      template = await db.query.themeVisualTemplates.findFirst({
        where: and(eq(themeVisualTemplates.formatId, format.id), eq(themeVisualTemplates.tenantId, options.tenantId)),
      });
    }

    signal.throwIfAborted();
    const editorial = await synthesizeScoutResearch({
      tenantId: options.tenantId,
      page: targetPage,
      sources: searchRes.results,
      signal,
    });
    signal.throwIfAborted();
    // Commit the cluster, package and durable receipt in one fenced transaction.
    const clusterTitle = primaryResult?.title || alert.title || `Trending: ${scout.name}`;
    const clusterSummary =
      primaryResult?.highlights?.join(" ").slice(0, 300) ||
      alert.samplePost?.content?.slice(0, 300) ||
      "Competitor viral hook detected by scout.";

    const { cluster, pkg } = await saveScoutRemixDraft(
      receipt,
      {
        tenantId: options.tenantId,
        themePageId: targetPage.id,
        title: clusterTitle,
        summary: clusterSummary,
        facts: editorial.facts,
        memberItemIds: [],
        freshnessScore: null,
        status: "open",
      },
      {
        tenantId: options.tenantId,
        themePageId: targetPage.id,
        formatId: format.id,
        templateId: template?.id,
        title: editorial.title,
        caption: editorial.caption,
        hashtags: editorial.hashtags,
        status: "pending_review",
        renderedAssetUrls: [],
        provenance: {
          scoutId: scout.id,
          competitorUrl: scout.targetUrl,
          heroImageReference,
          requiresFactReview: editorial.requiresFactReview,
          sourceMediaRights: "unknown",
          remixReceiptId: receipt.id,
          sources: searchRes.results.map((r) => ({
            title: r.title,
            url: r.url,
            heroImage: r.heroImage,
          })),
        },
      }
    );

    // Trigger media rendering
    let renderedUrls: Array<{ url: string; type: string }> = [];
    try {
      const renderRes = await renderPackageMedia(pkg.id, options.tenantId, `scout_remix_${receipt.id}`);
      renderedUrls = renderRes?.renderedUrls || [];
      if (renderRes?.queued) {
        await finishScoutRemix(receipt, "queued");
        return {
          success: true,
          packageId: pkg.id,
          clusterId: cluster.id,
          title: pkg.title,
          status: pkg.status,
          renderedUrls,
          renderState: "queued",
        };
      }
      if (renderedUrls.length === 0) {
        await finishScoutRemix(receipt, "failed", renderRes?.error || "Media rendering produced no output assets.");
        return {
          success: false,
          packageId: pkg.id,
          clusterId: cluster.id,
          title: pkg.title,
          status: pkg.status,
          renderState: "failed",
          error: renderRes?.error || "Media rendering produced no output assets.",
        };
      }
    } catch (renderErr: any) {
      await finishScoutRemix(
        receipt,
        "failed",
        renderErr instanceof Error ? renderErr.message : "Media rendering failed."
      );
      console.warn("[scouts-remix] Media card rendering failed:", renderErr);
      return {
        success: false,
        packageId: pkg.id,
        clusterId: cluster.id,
        title: pkg.title,
        status: pkg.status,
        renderState: "failed",
        error: `Media rendering failed: ${renderErr?.message || String(renderErr)}`,
      };
    }

    await finishScoutRemix(receipt, "complete");

    return {
      success: true,
      packageId: pkg.id,
      clusterId: cluster.id,
      title: pkg.title,
      status: pkg.status,
      renderedUrls,
      renderState: "completed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Remix failed.";
    await finishScoutRemix(receipt, "failed", message);
    return { success: false, error: message, renderState: "failed" };
  } finally {
    // Early validation returns are failures too: release unfinished work so a
    // corrected setup can retry immediately rather than waiting out the lease.
    await db
      .update(scoutRemixes)
      .set({ status: "failed", updatedAt: new Date() })
      .where(
        and(
          eq(scoutRemixes.id, receipt.id),
          eq(scoutRemixes.tenantId, options.tenantId),
          eq(scoutRemixes.leaseToken, receipt.leaseToken),
          eq(scoutRemixes.status, "processing")
        )
      );
  }
}
