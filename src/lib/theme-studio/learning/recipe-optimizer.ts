import { db } from "@/lib/db";
import { contentPackages, themeSlots, themeContentFormats, mixRecommendations } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { calculateQualityScore } from "./quality-scorer";

const MIN_SAMPLES_PER_FORMAT = 3;
const RECOMMENDATION_FRESHNESS_HOURS = 168; // 7 days

export interface SlotOptimizationResult {
  themePageId: string;
  evaluatedPackagesCount: number;
  formatScores: Record<string, { averageScore: number; sampleCount: number }>;
  adjustments: Array<{
    slotId: string;
    formatId: string;
    previousPriority: number;
    newPriority: number;
    formatName: string;
    score: number;
  }>;
  applied: boolean;
}

/**
 * Learns from recent post performance to optimize slot priorities for a theme
 * page. When applyChanges is false, returns a recommended ordering without
 * modifying the database (human-reviewed recommendations).
 */
export async function optimizeThemeSlotMix(
  tenantId: string,
  themePageId: string,
  options?: { applyChanges?: boolean }
): Promise<SlotOptimizationResult> {
  const published = await db.query.contentPackages.findMany({
    where: and(
      eq(contentPackages.themePageId, themePageId),
      eq(contentPackages.tenantId, tenantId),
      eq(contentPackages.status, "published")
    ),
    orderBy: [desc(contentPackages.publishedAt)],
    limit: 50,
  });

  const slots = await db.query.themeSlots.findMany({
    where: and(eq(themeSlots.themePageId, themePageId), eq(themeSlots.tenantId, tenantId), eq(themeSlots.isActive, true)),
  });

  const formats = await db.query.themeContentFormats.findMany({ where: eq(themeContentFormats.tenantId, tenantId) });
  const formatMap = new Map(formats.map((f) => [f.id, f]));

  const formatScores: Record<string, { totalScore: number; count: number }> = {};

  let evaluatedPackagesCount = 0;
  for (const pkg of published) {
    if (!hasUsableAnalyticsSample(pkg.metrics)) continue;
    const metrics = pkg.metrics;
    const { score } = calculateQualityScore(metrics);
    evaluatedPackagesCount += 1;

    if (!formatScores[pkg.formatId]) {
      formatScores[pkg.formatId] = { totalScore: 0, count: 0 };
    }
    formatScores[pkg.formatId].totalScore += score;
    formatScores[pkg.formatId].count += 1;
  }

  const averageFormatScores: Record<string, { averageScore: number; sampleCount: number }> = {};
  for (const [fmtId, data] of Object.entries(formatScores)) {
    averageFormatScores[fmtId] = {
      averageScore: data.count > 0 ? Math.round((data.totalScore / data.count) * 10) / 10 : 0,
      sampleCount: data.count,
    };
  }

  const qualifiedFormatIds = new Set(
    Object.entries(averageFormatScores)
      .filter(([, score]) => score.sampleCount >= MIN_SAMPLES_PER_FORMAT)
      .map(([formatId]) => formatId),
  );
  const hasComparison = qualifiedFormatIds.size >= 2;

  const rankedSlots = [...slots].sort((a, b) => {
    if (!hasComparison) return a.priority - b.priority;
    const scoreA = qualifiedFormatIds.has(a.formatId) ? averageFormatScores[a.formatId]?.averageScore : undefined;
    const scoreB = qualifiedFormatIds.has(b.formatId) ? averageFormatScores[b.formatId]?.averageScore : undefined;
    if (scoreA === undefined && scoreB === undefined) return a.priority - b.priority;
    if (scoreA === undefined) return 1;
    if (scoreB === undefined) return -1;
    return scoreB - scoreA || a.priority - b.priority;
  });

  const adjustments: SlotOptimizationResult["adjustments"] = [];

  for (let i = 0; i < rankedSlots.length; i++) {
    const slot = rankedSlots[i];
    const fmt = formatMap.get(slot.formatId);
    const score = averageFormatScores[slot.formatId]?.averageScore || 0;

    adjustments.push({
      slotId: slot.id,
      formatId: slot.formatId,
      previousPriority: slot.priority,
      newPriority: i,
      formatName: fmt?.name || "Format",
      score,
    });

    if (options?.applyChanges && hasComparison && slot.priority !== i) {
      await db
        .update(themeSlots)
        .set({ priority: i, updatedAt: new Date() })
        .where(and(eq(themeSlots.id, slot.id), eq(themeSlots.tenantId, tenantId)));
    }
  }

  return {
    themePageId,
    evaluatedPackagesCount,
    formatScores: averageFormatScores,
    adjustments,
    applied: Boolean(options?.applyChanges && hasComparison),
  };
}

export function hasUsableAnalyticsSample(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metrics = value as Record<string, unknown>;
  return (
    (typeof metrics.reach === "number" && Number.isFinite(metrics.reach)) ||
    (typeof metrics.likes === "number" && Number.isFinite(metrics.likes)) ||
    (typeof metrics.comments === "number" && Number.isFinite(metrics.comments)) ||
    (typeof metrics.shares === "number" && Number.isFinite(metrics.shares)) ||
    (typeof metrics.saves === "number" && Number.isFinite(metrics.saves))
  );
}

/**
 * Check whether a pending recommendation already exists for this theme page.
 */
export async function getPendingRecommendation(
  tenantId: string,
  themePageId: string,
) {
  return db.query.mixRecommendations.findFirst({
    where: and(
      eq(mixRecommendations.tenantId, tenantId),
      eq(mixRecommendations.themePageId, themePageId),
      eq(mixRecommendations.status, "pending"),
    ),
    orderBy: [desc(mixRecommendations.createdAt)],
  });
}

/**
 * Store a new recommendation for human review.
 */
export async function storeMixRecommendation(
  tenantId: string,
  result: SlotOptimizationResult,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(mixRecommendations).values({
    id,
    tenantId,
    themePageId: result.themePageId,
    formatScores: result.formatScores,
    adjustments: result.adjustments,
    status: "pending",
  });
  return id;
}

/**
 * Accept a pending recommendation: apply slot reorder and mark as accepted.
 */
export async function acceptMixRecommendation(
  tenantId: string,
  recommendationId: string,
): Promise<{ applied: number }> {
  const rec = await db.query.mixRecommendations.findFirst({
    where: and(
      eq(mixRecommendations.id, recommendationId),
      eq(mixRecommendations.tenantId, tenantId),
      eq(mixRecommendations.status, "pending"),
    ),
  });
  if (!rec) return { applied: 0 };

  const adjustments = rec.adjustments as Array<{
    slotId: string;
    previousPriority: number;
    newPriority: number;
  }>;

  let applied = 0;
  for (const adj of adjustments) {
    if (adj.previousPriority !== adj.newPriority) {
      await db
        .update(themeSlots)
        .set({ priority: adj.newPriority, updatedAt: new Date() })
        .where(and(eq(themeSlots.id, adj.slotId), eq(themeSlots.tenantId, tenantId)));
      applied++;
    }
  }

  await db
    .update(mixRecommendations)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(and(eq(mixRecommendations.id, recommendationId), eq(mixRecommendations.tenantId, tenantId)));

  return { applied };
}

/**
 * Discard a pending recommendation.
 */
export async function discardMixRecommendation(
  tenantId: string,
  recommendationId: string,
): Promise<boolean> {
  const result = await db
    .update(mixRecommendations)
    .set({ status: "discarded" })
    .where(
      and(
        eq(mixRecommendations.id, recommendationId),
        eq(mixRecommendations.tenantId, tenantId),
        eq(mixRecommendations.status, "pending"),
      ),
    )
    .returning({ id: mixRecommendations.id });
  return result.length > 0;
}

/**
 * Periodically generate recommendations for active pages.
 * Skips if a pending recommendation already exists.
 */
export async function processThemeStudioOptimization(): Promise<void> {
  const activeSlots = await db.query.themeSlots.findMany({
    columns: { tenantId: true, themePageId: true },
    where: eq(themeSlots.isActive, true),
    limit: 100,
  });

  const seen = new Set<string>();
  for (const { tenantId, themePageId } of activeSlots) {
    const key = `${tenantId}:${themePageId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const existing = await getPendingRecommendation(tenantId, themePageId);
      if (existing) continue;

      const result = await optimizeThemeSlotMix(tenantId, themePageId, { applyChanges: false });
      if (!result.adjustments.some((a) => a.previousPriority !== a.newPriority)) continue;

      await storeMixRecommendation(tenantId, result);
    } catch {
      // optimization failures are non-fatal
    }
  }
}
