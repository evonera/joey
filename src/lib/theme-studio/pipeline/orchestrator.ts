import { db } from "@/lib/db";
import { themeSources } from "@/lib/db/schema";
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
  clustersCreated: number;
  packageResult: PackageGenerationResult;
  packagesRendered: number;
  renderFailures: Array<{ packageId: string; error: string }>;
  timestamp: string;
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

  for (const src of sources) {
    signal?.throwIfAborted();
    const res = await pollAndIngestSource(tenantId, src.id, signal);
    totalIngested += res.ingestedCount;
    totalDuplicatesFiltered += res.duplicateCount;
    await heartbeat?.();
  }

  const clusterRes = await clusterSourceItems(tenantId, themePageId, signal);
  await heartbeat?.();

  const packageResult = await synthesizeAndAllocatePackages(tenantId, themePageId, flowRunId, signal, heartbeat);
  let packagesRendered = 0;
  const renderFailures: Array<{ packageId: string; error: string }> = [];
  for (const packageId of packageResult.packageIds) {
    signal?.throwIfAborted();
    const result = await renderPackageMedia(packageId, tenantId, flowRunId, signal, heartbeat);
    if (result.success) {
      packagesRendered += 1;
    } else {
      renderFailures.push({ packageId, error: result.error || "Media rendering failed" });
    }
    await heartbeat?.();
  }

  return {
    themePageId,
    sourcesPolled: sources.length,
    totalIngested,
    totalDuplicatesFiltered,
    clustersCreated: clusterRes.clustersCreated,
    packageResult,
    packagesRendered,
    renderFailures,
    timestamp: new Date().toISOString(),
  };
}
