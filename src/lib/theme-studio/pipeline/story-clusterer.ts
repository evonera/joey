import { db } from "@/lib/db";
import { sourceItems, storyClusters, themePages } from "@/lib/db/schema";
import { eq, and, desc, gte, inArray } from "drizzle-orm";

export interface ClusterCandidate {
  title: string;
  summary: string;
  memberItemIds: string[];
  facts: Array<{ claim: string; sourceUrl?: string; entity?: string }>;
  freshnessScore: number;
}

/**
 * Basic keyword token jaccard similarity for clustering articles sharing topic terms.
 */
export function calculateTopicOverlap(a: string, b: string): number {
  const getTokens = (str: string) =>
    new Set(
      str
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((t) => t.length > 3)
    );

  const tokensA = getTokens(a);
  const tokensB = getTokens(b);

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Clusters raw source items for a theme page into story topics.
 */
export async function clusterSourceItems(tenantId: string, themePageId: string, signal?: AbortSignal): Promise<{
  themePageId: string;
  clusteredCount: number;
  clustersCreated: number;
}> {
  const page = await db.query.themePages.findFirst({
    where: and(eq(themePages.id, themePageId), eq(themePages.tenantId, tenantId)),
  });
  if (!page) throw new Error("Theme page not found");

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h freshness window

  const rawItems = await db.query.sourceItems.findMany({
    where: and(
      eq(sourceItems.themePageId, themePageId),
      eq(sourceItems.tenantId, tenantId),
      eq(sourceItems.status, "raw"),
      gte(sourceItems.publishedAt, cutoff)
    ),
    orderBy: [desc(sourceItems.publishedAt)],
    limit: 50,
  });

  if (rawItems.length === 0) {
    return { themePageId, clusteredCount: 0, clustersCreated: 0 };
  }

  return db.transaction(async (tx) => {
    const claimedItems = await tx.update(sourceItems)
      .set({ status: "clustered" })
      .where(and(
        eq(sourceItems.tenantId, tenantId),
        eq(sourceItems.themePageId, themePageId),
        eq(sourceItems.status, "raw"),
        inArray(sourceItems.id, rawItems.map((item) => item.id)),
      ))
      .returning();
    claimedItems.sort((left, right) => (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0));
    if (claimedItems.length === 0) {
      return { themePageId, clusteredCount: 0, clustersCreated: 0 };
    }

    const clusters: ClusterCandidate[] = [];
    const assignedItemIds = new Set<string>();
    for (const item of claimedItems) {
      signal?.throwIfAborted();
      if (assignedItemIds.has(item.id)) continue;

      const clusterMembers = [item];
      assignedItemIds.add(item.id);
      for (const candidate of claimedItems) {
        if (assignedItemIds.has(candidate.id)) continue;
        const overlap = calculateTopicOverlap(
          `${item.title} ${item.body || ""}`,
          `${candidate.title} ${candidate.body || ""}`,
        );
        if (overlap >= 0.25) {
          clusterMembers.push(candidate);
          assignedItemIds.add(candidate.id);
        }
      }

      const primary = clusterMembers[0];
      const newestTimestamp = Math.max(...clusterMembers.map((member) => member.publishedAt?.getTime() ?? 0));
      const ageHours = Math.max(0, (Date.now() - newestTimestamp) / (60 * 60 * 1000));
      clusters.push({
        title: primary.title || "Trending Topic",
        summary: primary.body?.slice(0, 300) || primary.title || "",
        memberItemIds: clusterMembers.map((member) => member.id),
        facts: clusterMembers.map((member) => ({
          claim: member.title || "Key finding",
          sourceUrl: member.url || undefined,
          entity: primary.title?.split(" ")[0] || undefined,
        })),
        freshnessScore: Math.max(0, Math.round((10 - ageHours / 4) * 100) / 100),
      });
    }

    for (const cluster of clusters) {
      signal?.throwIfAborted();
      await tx.insert(storyClusters).values({
        tenantId: page.tenantId,
        themePageId,
        title: cluster.title,
        summary: cluster.summary,
        facts: cluster.facts,
        memberItemIds: cluster.memberItemIds,
        freshnessScore: cluster.freshnessScore.toString(),
        status: "open",
      });
    }

    return {
      themePageId,
      clusteredCount: claimedItems.length,
      clustersCreated: clusters.length,
    };
  });
}
