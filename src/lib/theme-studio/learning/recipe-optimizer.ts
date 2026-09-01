import { db } from "@/lib/db";
import { contentPackages, themeSlots, themeContentFormats } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { calculateQualityScore } from "./quality-scorer";

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
 * Learns from recent post performance to automatically optimize slot priorities for a theme page.
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

  // Calculate average quality score by format
  const formatScores: Record<string, { totalScore: number; count: number }> = {};

  for (const pkg of published) {
    const metrics = pkg.metrics && typeof pkg.metrics === "object" ? pkg.metrics : {};
    const { score } = calculateQualityScore(metrics);

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

  // Sort slots by format average score descending (higher score = higher priority = lower index)
  const rankedSlots = [...slots].sort((a, b) => {
    const scoreA = averageFormatScores[a.formatId]?.averageScore || 0;
    const scoreB = averageFormatScores[b.formatId]?.averageScore || 0;
    return scoreB - scoreA;
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

    if (options?.applyChanges && slot.priority !== i) {
      await db
        .update(themeSlots)
        .set({ priority: i, updatedAt: new Date() })
        .where(and(eq(themeSlots.id, slot.id), eq(themeSlots.tenantId, tenantId)));
    }
  }

  return {
    themePageId,
    evaluatedPackagesCount: published.length,
    formatScores: averageFormatScores,
    adjustments,
    applied: options?.applyChanges ?? false,
  };
}
