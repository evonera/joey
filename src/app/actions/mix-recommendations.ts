"use server";

import { getActiveTenantId } from "@/lib/auth";
import {
  getPendingRecommendation,
  acceptMixRecommendation,
  discardMixRecommendation,
  type SlotOptimizationResult,
} from "@/lib/theme-studio/learning/recipe-optimizer";

interface Recommendation {
  id: string;
  formatScores: Record<string, { averageScore: number; sampleCount: number }>;
  adjustments: SlotOptimizationResult["adjustments"];
  status: string;
  createdAt: Date;
  acceptedAt: Date | null;
}

export async function getMixRecommendations(themePageId: string) {
  const tenantId = await getActiveTenantId();
  const pending = await getPendingRecommendation(tenantId, themePageId);
  if (!pending) return { recommendation: null };
  return {
    recommendation: {
      id: pending.id,
      formatScores: pending.formatScores as Record<string, { averageScore: number; sampleCount: number }>,
      adjustments: pending.adjustments as SlotOptimizationResult["adjustments"],
      status: pending.status,
      createdAt: pending.createdAt,
      acceptedAt: pending.acceptedAt,
    } satisfies Recommendation,
  };
}

export async function acceptRecommendation(recommendationId: string) {
  const tenantId = await getActiveTenantId();
  const result = await acceptMixRecommendation(tenantId, recommendationId);
  if (result.applied === 0) {
    return { error: "Recommendation not found or already processed" };
  }
  return { applied: result.applied };
}

export async function discardRecommendation(recommendationId: string) {
  const tenantId = await getActiveTenantId();
  const discarded = await discardMixRecommendation(tenantId, recommendationId);
  if (!discarded) {
    return { error: "Recommendation not found or already processed" };
  }
  return { ok: true };
}
