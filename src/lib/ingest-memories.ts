import { db } from "@/lib/db";
import { agentConfigs, posts, memories } from "@/lib/db/schema";
import { eq, and, asc, desc, gt } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embeddings";
import { insertMemory, insertMemoryWithEmbedding, prepareMemoryContent } from "@/lib/memories";
import { operationalEvent } from "@/lib/operations-log";

/** Page size for scanning existing published-post memories. */
const EXISTING_MEMORY_PAGE_SIZE = 200;

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === "23505") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate key|unique constraint|already exists/i.test(message);
}

export async function syncTenantBrandGuidelines(tenantId: string) {
  const config = await db.query.agentConfigs.findFirst({
    where: eq(agentConfigs.tenantId, tenantId),
  });
  if (!config) return;

  const existing = await db.query.memories.findFirst({
    where: and(
      eq(memories.tenantId, tenantId),
      eq(memories.type, "brand_guideline"),
    ),
  });

  const content = [
    config.brandVoice ? `Brand Voice: ${config.brandVoice}` : null,
    config.postingGoals ? `Posting Goals: ${config.postingGoals}` : null,
  ].filter(Boolean).join("\n\n");

  if (!content) return;

  const metadata = {
    updatedAt: config.updatedAt?.toISOString(),
  };
  const sourceUpdatedAt = config.updatedAt?.getTime() ?? 0;

  if (existing) {
    const existingMeta = existing.metadata as any;
    const existingUpdatedAt = existingMeta?.updatedAt
      ? new Date(existingMeta.updatedAt).getTime()
      : 0;

    if (sourceUpdatedAt <= existingUpdatedAt) return;
  }

  // Compute the embedding outside the transaction (no lock held during
  // network I/O), then swap atomically: delete-all-then-insert, so
  // concurrent readers never observe duplicate guidelines and historical
  // dupes are compacted away.
  const prepared = prepareMemoryContent(content);
  const embedding = await generateEmbedding(prepared, tenantId);
  const swap = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    // Re-check under lock: an overlapping sync may have committed a newer
    // guideline while this embedding was in flight. Aborting here prevents
    // stale content from overwriting it (lost update).
    const [locked] = await tx
      .select({ metadata: memories.metadata })
      .from(memories)
      .where(
        and(
          eq(memories.tenantId, tenantId),
          eq(memories.type, "brand_guideline"),
        ),
      )
      .limit(1)
      .for("update");
    const lockedUpdatedAt = (locked?.metadata as any)?.updatedAt
      ? new Date((locked.metadata as any).updatedAt).getTime()
      : 0;
    if (lockedUpdatedAt > sourceUpdatedAt) {
      // Superseded: an overlapping sync committed newer content while this
      // embedding was in flight. Returning early leaves its write intact
      // (benign race outcome, not an error).
      return;
    }
    await tx.delete(memories).where(
      and(
        eq(memories.tenantId, tenantId),
        eq(memories.type, "brand_guideline"),
      ),
    );
    await insertMemoryWithEmbedding(tenantId, prepared, "brand_guideline", metadata, embedding, tx);
  };
  try {
    await db.transaction(swap);
  } catch (err) {
    // First-time insert race: no row existed to lock, both syncs inserted,
    // one hit the one-per-tenant unique index. Re-read and retry once only
    // if ours is strictly newer; otherwise the peer's write stands.
    if (!isUniqueViolation(err)) throw err;
    const winner = await db.query.memories.findFirst({
      where: and(
        eq(memories.tenantId, tenantId),
        eq(memories.type, "brand_guideline"),
      ),
    });
    const winnerUpdatedAt = (winner?.metadata as any)?.updatedAt
      ? new Date((winner?.metadata as any).updatedAt).getTime()
      : 0;
    if (!winner || sourceUpdatedAt <= winnerUpdatedAt) return;
    await db.transaction(swap);
  }
}

export async function syncTenantPublishedPosts(tenantId: string) {
  const publishedPosts = await db.query.posts.findMany({
    where: and(
      eq(posts.tenantId, tenantId),
      eq(posts.status, "published"),
    ),
    orderBy: [desc(posts.publishedAt)],
    limit: 50,
  });

  if (publishedPosts.length === 0) return;

  // Paginated scan (id cursor) instead of one unbounded fetch: tenants with
  // thousands of memories must not OOM the sync.
  const existingPostIds = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const batch = await db.query.memories.findMany({
      where: and(
        eq(memories.tenantId, tenantId),
        eq(memories.type, "published_post"),
        cursor ? gt(memories.id, cursor) : undefined,
      ),
      orderBy: [asc(memories.id)],
      limit: EXISTING_MEMORY_PAGE_SIZE,
      columns: { id: true, metadata: true },
    });
    if (batch.length === 0) break;
    for (const mem of batch) {
      const meta = mem.metadata as any;
      if (meta?.postId) {
        existingPostIds.add(meta.postId);
      }
    }
    if (batch.length < EXISTING_MEMORY_PAGE_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }

  for (const post of publishedPosts) {
    if (existingPostIds.has(post.id)) continue;

    let metrics = "";
    if (post.metrics) {
      const m = post.metrics as any;
      const parts: string[] = [];
      if (m.likes) parts.push(`${m.likes} likes`);
      if (m.comments) parts.push(`${m.comments} comments`);
      if (m.shares) parts.push(`${m.shares} shares`);
      if (m.impressions) parts.push(`${m.impressions} impressions`);
      if (parts.length > 0) metrics = `\nPerformance: ${parts.join(", ")}.`;
    }

    const content = post.content + metrics;

    await insertMemory(tenantId, content, "published_post", {
      postId: post.id,
      publishedAt: post.publishedAt?.toISOString(),
      metrics: post.metrics,
    });
  }
}

/**
 * Syncs both memory streams. Resolves with per-stream outcomes so callers
 * (e.g. the user-requested brand-kit reindex) can report partial failures
 * instead of a blanket success.
 */
export async function syncTenantMemories(
  tenantId: string,
): Promise<{ ok: boolean; errors: string[] }> {
  const results = await Promise.allSettled([
    syncTenantBrandGuidelines(tenantId),
    syncTenantPublishedPosts(tenantId),
  ]);
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(message);
      operationalEvent("error", "memory_sync.failed", { tenantId, error: message });
    }
  }
  return { ok: errors.length === 0, errors };
}
