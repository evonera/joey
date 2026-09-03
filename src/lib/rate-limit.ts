import { db } from "@/lib/db";
import { rateLimitCounters } from "@/lib/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";

// Fixed-window per-token rate limiting backed by Postgres so the documented
// limit holds across application instances and process restarts.

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export async function checkRateLimit(
  tokenId: string,
  limit = 60,
  windowMs = 60000,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt = windowStart.getTime() + windowMs;

  // Atomic upsert-and-increment: safe under concurrent instances.
  // (This drizzle version's .returning() takes no arguments, so read after.)
  await db
    .insert(rateLimitCounters)
    .values({ tokenId, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitCounters.tokenId, rateLimitCounters.windowStart],
      set: { count: sql`${rateLimitCounters.count} + 1` },
    });

  const rows = await db
    .select({ count: rateLimitCounters.count })
    .from(rateLimitCounters)
    .where(
      and(
        eq(rateLimitCounters.tokenId, tokenId),
        eq(rateLimitCounters.windowStart, windowStart),
      ),
    );

  const count = rows[0]?.count ?? 1;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

/**
 * Prunes expired rate limit windows older than a threshold (default 24h).
 */
export async function pruneExpiredRateLimits(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const deleted = await db
    .delete(rateLimitCounters)
    .where(lt(rateLimitCounters.windowStart, cutoff))
    .returning({ tokenId: rateLimitCounters.tokenId });
  return deleted.length;
}
