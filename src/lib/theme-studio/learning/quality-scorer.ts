export interface PostEngagementMetrics {
  saves: number;
  shares: number;
  comments: number;
  likes: number;
  reach: number;
  impressions?: number;
  unfollows?: number;
}

export interface QualityScoreWeights {
  saveWeight?: number;
  shareWeight?: number;
  commentWeight?: number;
  likeWeight?: number;
  reachWeight?: number;
  unfollowPenalty?: number;
}

const DEFAULT_WEIGHTS: Required<QualityScoreWeights> = {
  saveWeight: 5.0,     // High algorithmic signal in 2025/2026
  shareWeight: 6.0,    // Highest virality signal
  commentWeight: 3.0,  // Meaningful conversation signal
  likeWeight: 0.5,     // Weakest positive signal
  reachWeight: 0.02,   // Volume scaling factor
  unfollowPenalty: 10.0, // Strict penalty for content churn
};

/**
 * Computes a normalized Quality Score for a social post based on modern algorithmic ranking factors.
 */
export function calculateQualityScore(
  metrics: Partial<PostEngagementMetrics>,
  customWeights?: QualityScoreWeights
): { score: number; signals: Record<string, number> } {
  const w = { ...DEFAULT_WEIGHTS, ...customWeights };

  const metric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  const saveScore = metric(metrics.saves) * w.saveWeight;
  const shareScore = metric(metrics.shares) * w.shareWeight;
  const commentScore = metric(metrics.comments) * w.commentWeight;
  const likeScore = metric(metrics.likes) * w.likeWeight;
  const reachScore = metric(metrics.reach) * w.reachWeight;
  const unfollowScore = metric(metrics.unfollows) * w.unfollowPenalty;

  const rawScore = saveScore + shareScore + commentScore + likeScore + reachScore - unfollowScore;
  const score = Math.max(0, Math.round(rawScore * 10) / 10);

  return {
    score,
    signals: {
      saveScore,
      shareScore,
      commentScore,
      likeScore,
      reachScore,
      unfollowPenalty: unfollowScore,
    },
  };
}
