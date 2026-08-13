// Token-bucket rate limiter: 60 requests per minute per token
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(tokenId: string, limit = 60, windowMs = 60000): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = buckets.get(tokenId);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(tokenId, bucket);
  }
  bucket.count++;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}
