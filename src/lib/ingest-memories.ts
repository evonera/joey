import { db } from "@/lib/db";
import { agentConfigs, posts, memories } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { insertMemory } from "@/lib/memories";

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

    await db.delete(memories)
      .where(and(
        eq(memories.tenantId, tenantId),
        eq(memories.type, "brand_guideline"),
      ));
  }

  await insertMemory(tenantId, content, "brand_guideline", metadata);
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

  const existingPostIds = new Set<string>();

  const existingMemories = await db.query.memories.findMany({
    where: and(
      eq(memories.tenantId, tenantId),
      eq(memories.type, "published_post"),
    ),
  });

  for (const mem of existingMemories) {
    const meta = mem.metadata as any;
    if (meta?.postId) {
      existingPostIds.add(meta.postId);
    }
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
  await Promise.all([
    syncTenantBrandGuidelines(tenantId),
    syncTenantPublishedPosts(tenantId),
  ]);
}
