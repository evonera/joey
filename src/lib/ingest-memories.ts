import { db } from "@/lib/db";
import { agentConfigs, posts, memories } from "@/lib/db/schema";
import { eq, and, asc, desc, gt } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embeddings";
import { insertMemory, insertMemoryWithEmbedding, prepareMemoryContent } from "@/lib/memories";
import { operationalEvent } from "@/lib/operations-log";

/** Page size for scanning existing published-post memories. */
const EXISTING_MEMORY_PAGE_SIZE = 200;

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

  if (existing) {
    const updatedAt = config.updatedAt?.getTime() ?? 0;
    const existingMeta = existing.metadata as any;
    const existingUpdatedAt = existingMeta?.updatedAt
      ? new Date(existingMeta.updatedAt).getTime()
      : 0;

    if (updatedAt <= existingUpdatedAt) return;
  }

  // Compute the embedding outside the transaction (no lock held during
  // network I/O), then swap atomically: delete-all-then-insert, so
  // concurrent readers never observe duplicate guidelines and historical
  // dupes are compacted away.
  const prepared = prepareMemoryContent(content);
  const embedding = await generateEmbedding(prepared, tenantId);
  await db.transaction(async (tx) => {
    await tx.delete(memories).where(
      and(
        eq(memories.tenantId, tenantId),
        eq(memories.type, "brand_guideline"),
      ),
    );
    await insertMemoryWithEmbedding(tenantId, prepared, "brand_guideline", metadata, embedding, tx);
  });
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

export async function syncTenantMemories(tenantId: string) {
  const results = await Promise.allSettled([
    syncTenantBrandGuidelines(tenantId),
    syncTenantPublishedPosts(tenantId),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      operationalEvent("error", "memory_sync.failed", {
        tenantId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
}
