import { db } from "@/lib/db";
import { themeSources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { pollAndIngestSource } from "./source-poller";
import { clusterSourceItems } from "./story-clusterer";
import { synthesizeAndAllocatePackages, PackageGenerationResult } from "./angle-synthesizer";

export interface PipelineExecutionReport {
  themePageId: string;
  sourcesPolled: number;
  totalIngested: number;
  totalDuplicatesFiltered: number;
  clustersCreated: number;
  packageResult: PackageGenerationResult;
  timestamp: string;
}

/**
 * Runs the complete Theme Studio editorial pipeline end-to-end for a page:
 * Ingest Sources -> Pre-LLM Dedup -> Cluster Topics -> Rights Verify -> Allocate Packages
 */
export async function runEditorialPipeline(themePageId: string): Promise<PipelineExecutionReport> {
  const sources = await db.query.themeSources.findMany({
    where: and(eq(themeSources.themePageId, themePageId), eq(themeSources.isActive, true)),
  });

  let totalIngested = 0;
  let totalDuplicatesFiltered = 0;

  for (const src of sources) {
    const res = await pollAndIngestSource(src.id);
    totalIngested += res.ingestedCount;
    totalDuplicatesFiltered += res.duplicateCount;
  }

  const clusterRes = await clusterSourceItems(themePageId);

  const packageResult = await synthesizeAndAllocatePackages(themePageId);

  return {
    themePageId,
    sourcesPolled: sources.length,
    totalIngested,
    totalDuplicatesFiltered,
    clustersCreated: clusterRes.clustersCreated,
    packageResult,
    timestamp: new Date().toISOString(),
  };
}
