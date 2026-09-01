import { db } from "@/lib/db";
import { contentPackages, themeSources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { pollAndIngestSource } from "./source-poller";
import { clusterSourceItems } from "./story-clusterer";
import { synthesizeAndAllocatePackages, PackageGenerationResult } from "./angle-synthesizer";
import { renderPackageMedia } from "../renderers/media-assembler";

export interface PipelineExecutionReport {
  themePageId: string;
  sourcesPolled: number;
  totalIngested: number;
  totalDuplicatesFiltered: number;
  sourceErrors: Array<{ sourceId: string; error: string }>;
  clustersCreated: number;
  packageResult: PackageGenerationResult;
  packagesRendered: number;
  packagesRetried: number;
  renderFailures: Array<{ packageId: string; error: string }>;
  timestamp: string;
}

const VIDEO_RENDERER_NOT_CONFIGURED = "Video preview is available, but an MP4 render worker has not been configured";

export function shouldRetryFailedRender(renderedAssetUrls: unknown, error: string | null): boolean {
  const assets = Array.isArray(renderedAssetUrls) ? renderedAssetUrls : [];
  const hasPublicAsset = assets.some((asset) => (
    Boolean(asset) && typeof asset === "object" && "url" in asset
    && typeof asset.url === "string" && asset.url.startsWith("https://")
  ));
  return !hasPublicAsset && error !== VIDEO_RENDERER_NOT_CONFIGURED;
}

/**
 * Runs the complete Theme Studio editorial pipeline end-to-end for a page:
 * Ingest Sources -> Pre-LLM Dedup -> Cluster Topics -> Rights Verify -> Allocate Packages
 */
export async function runEditorialPipeline(
  tenantId: string,
  themePageId: string,
  flowRunId: string,
  signal?: AbortSignal,
  heartbeat?: () => Promise<void> | void,
): Promise<PipelineExecutionReport> {
  const sources = await db.query.themeSources.findMany({
    where: and(eq(themeSources.themePageId, themePageId), eq(themeSources.tenantId, tenantId), eq(themeSources.isActive, true)),
  });

  let totalIngested = 0;
  let totalDuplicatesFiltered = 0;
  const sourceErrors: Array<{ sourceId: string; error: string }> = [];

  for (const src of sources) {
    signal?.throwIfAborted();
    const res = await pollAndIngestSource(tenantId, src.id, signal);
    totalIngested += res.ingestedCount;
    totalDuplicatesFiltered += res.duplicateCount;
    sourceErrors.push(...(res.errors || []).map((error) => ({ sourceId: src.id, error })));
    await heartbeat?.();
  }

  const clusterRes = await clusterSourceItems(tenantId, themePageId, signal);
  await heartbeat?.();

  const packageResult = await synthesizeAndAllocatePackages(tenantId, themePageId, flowRunId, signal, heartbeat);
  const failedPackages = await db.query.contentPackages.findMany({
    where: and(
      eq(contentPackages.tenantId, tenantId),
      eq(contentPackages.themePageId, themePageId),
      eq(contentPackages.status, "failed"),
    ),
    columns: { id: true, renderedAssetUrls: true, error: true },
    limit: 50,
  });
  const retryPackageIds = failedPackages
    .filter((pkg) => shouldRetryFailedRender(pkg.renderedAssetUrls, pkg.error))
    .map((pkg) => pkg.id);
  const packageIdsToRender = [...new Set([...retryPackageIds, ...packageResult.packageIds])];
  let packagesRendered = 0;
  const renderFailures: Array<{ packageId: string; error: string }> = [];
  for (const packageId of packageIdsToRender) {
    signal?.throwIfAborted();
    const result = await renderPackageMedia(packageId, tenantId, flowRunId, signal, heartbeat);
    if (result.success) {
      packagesRendered += 1;
    } else {
      renderFailures.push({ packageId, error: result.error || "Media rendering failed" });
    }
    await heartbeat?.();
  }
  signal?.throwIfAborted();
  if (sourceErrors.length > 0 || renderFailures.length > 0) {
    throw new Error(
      `Theme Studio completed with ${sourceErrors.length} source error(s) and ${renderFailures.length} render error(s); durable work remains queued for retry`,
    );
  }

  return {
    themePageId,
    sourcesPolled: sources.length,
    totalIngested,
    totalDuplicatesFiltered,
    sourceErrors,
    clustersCreated: clusterRes.clustersCreated,
    packageResult,
    packagesRendered,
    packagesRetried: retryPackageIds.length,
    renderFailures,
    timestamp: new Date().toISOString(),
  };
}
