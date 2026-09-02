import { db } from "@/lib/db";
import { contentPackages, themeSources } from "@/lib/db/schema";
import { eq, and, or, sql, asc } from "drizzle-orm";
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

export function shouldRetryPackageRender(
  status: string,
  renderedAssetUrls: unknown,
  metrics: unknown,
): boolean {
  const assets = Array.isArray(renderedAssetUrls) ? renderedAssetUrls : [];
  const hasPublicAsset = assets.some((asset) => (
    Boolean(asset) && typeof asset === "object" && "url" in asset
    && typeof asset.url === "string" && asset.url.startsWith("https://")
  ));
  const failurePhase = metrics && typeof metrics === "object" && !Array.isArray(metrics)
    && "failurePhase" in metrics ? metrics.failurePhase : undefined;
  if (hasPublicAsset) return false;
  if (status === "pending_review") {
    return failurePhase === undefined || failurePhase === null || failurePhase === "render_pending" || failurePhase === "render";
  }
  return status === "failed" && failurePhase === "render";
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
  const recoverablePackages = await db.query.contentPackages.findMany({
    where: and(
      eq(contentPackages.tenantId, tenantId),
      eq(contentPackages.themePageId, themePageId),
      sql`${contentPackages.renderedAssetUrls} = '[]'::jsonb`,
      or(
        and(
          eq(contentPackages.status, "pending_review"),
          sql`coalesce(${contentPackages.metrics}->>'failurePhase', 'render_pending') in ('render_pending', 'render')`,
        ),
        and(
          eq(contentPackages.status, "failed"),
          sql`${contentPackages.metrics}->>'failurePhase' = 'render'`,
        ),
      ),
    ),
    columns: { id: true, status: true, renderedAssetUrls: true, metrics: true },
    orderBy: [asc(contentPackages.updatedAt), asc(contentPackages.id)],
    limit: 50,
  });
  const retryPackageIds = recoverablePackages
    .filter((pkg) => shouldRetryPackageRender(pkg.status, pkg.renderedAssetUrls, pkg.metrics))
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
