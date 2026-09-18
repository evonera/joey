import { db } from "@/lib/db";
import { sourceItems, storyClusters, themePages } from "@/lib/db/schema";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import {
  evaluateStoryAffinitySemantically,
  getTypesafeClient,
  type ThemePageContext,
} from "@/lib/typesafe";
import type { TypeSafeClient } from "@typesafe-ai/sdk";

export interface SourcedFact {
  claim: string;
  sourceUrl?: string;
  entity?: string;
  corroborationStatus?: "verified" | "additive" | "contradicted" | "unverified";
  semanticConfidence?: number;
}

export interface ClusterCandidate {
  title: string;
  summary: string;
  memberItemIds: string[];
  facts: SourcedFact[];
  freshnessScore: number;
}

export interface ClusteringShadowComparison {
  primaryItemId: string;
  candidateItemId: string;
  primaryTitle: string;
  candidateTitle: string;
  jaccardOverlap: number;
  jaccardClustered: boolean;
  jevRelationship: "same_event" | "related_topic" | "unrelated" | "unknown";
  jevCorroboration: "corroborates" | "neutral_or_additive" | "contradicts" | "unknown";
  jevConfidence: number;
  jevProbability: number;
  agreement: boolean;
  disagreementType?: "false_positive_jaccard" | "false_negative_jaccard";
}

export interface ClusteringShadowReport {
  mode: "shadow" | "active" | "off";
  totalEvaluated: number;
  agreements: number;
  disagreements: number;
  potentialFalsePositives: number;
  potentialFalseNegatives: number;
  comparisons: ClusteringShadowComparison[];
}

export interface ClusterSourceItemsOptions {
  mode?: "shadow" | "active" | "off";
  client?: TypeSafeClient;
  maxSemanticEvaluations?: number;
}

export interface ClusterSourceItemsResult {
  themePageId: string;
  clusteredCount: number;
  clustersCreated: number;
  shadowReport?: ClusteringShadowReport;
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
 *
 * Runs Jaccard similarity as the baseline clustering mechanism.
 * When TypeSafe is available, runs Jev in shadow mode to evaluate clustering agreement,
 * detect false positives/negatives, and corroborate factual claims across sources.
 */
export async function clusterSourceItems(
  tenantId: string,
  themePageId: string,
  signal?: AbortSignal,
  options?: ClusterSourceItemsOptions,
): Promise<ClusterSourceItemsResult> {
  const page = await db.query.themePages.findFirst({
    where: and(eq(themePages.id, themePageId), eq(themePages.tenantId, tenantId)),
  });
  if (!page) throw new Error("Theme page not found");

  const pageContext: ThemePageContext = {
    name: page.name,
    niche: page.niche,
    audience: page.audience,
  };

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

  // Atomically claim raw items in a fast transaction
  const claimedItems = await db.transaction(async (tx) => {
    const updated = await tx.update(sourceItems)
      .set({ status: "clustered" })
      .where(and(
        eq(sourceItems.tenantId, tenantId),
        eq(sourceItems.themePageId, themePageId),
        eq(sourceItems.status, "raw"),
        inArray(sourceItems.id, rawItems.map((item) => item.id)),
      ))
      .returning();
    return updated;
  });

  claimedItems.sort((left, right) => (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0));
  if (claimedItems.length === 0) {
    return { themePageId, clusteredCount: 0, clustersCreated: 0 };
  }

  try {
    // Resolve TypeSafe client & clustering mode
    const client = options?.client ?? (await getTypesafeClient(tenantId));
    const configuredMode = (options?.mode ?? process.env.THEME_STUDIO_CLUSTERING_MODE ?? (client ? "shadow" : "off")) as "shadow" | "active" | "off";
    const runSemanticEvaluation = client && configuredMode !== "off";
    const maxSemanticEvals = options?.maxSemanticEvaluations ?? 15;

    const shadowReport: ClusteringShadowReport = {
      mode: configuredMode,
      totalEvaluated: 0,
      agreements: 0,
      disagreements: 0,
      potentialFalsePositives: 0,
      potentialFalseNegatives: 0,
      comparisons: [],
    };

    const clusters: ClusterCandidate[] = [];
    const assignedItemIds = new Set<string>();

    // Map to store evaluated semantic corroboration status for items: itemId -> { status, confidence }
    const itemCorroborationMap = new Map<string, { status: SourcedFact["corroborationStatus"]; confidence: number }>();

    let semanticEvalsDone = 0;

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
        const jaccardClustered = overlap >= 0.25;

        let memberIncluded = jaccardClustered;

        // Evaluate semantic affinity with Jev for candidate comparisons within evaluation budget
        const shouldEvaluateSemantically =
          runSemanticEvaluation &&
          semanticEvalsDone < maxSemanticEvals;

        if (shouldEvaluateSemantically) {
          semanticEvalsDone++;
          try {
            const affinity = await evaluateStoryAffinitySemantically(
              { id: item.id, title: item.title, body: item.body },
              { id: candidate.id, title: candidate.title, body: candidate.body },
              tenantId,
              { client, pageContext },
            );

            if (affinity) {
              const isJevSameEvent = affinity.relationship === "same_event" && affinity.relationshipConfidence >= 0.80;
              const agreement = (jaccardClustered && isJevSameEvent) || (!jaccardClustered && !isJevSameEvent);

              let disagreementType: ClusteringShadowComparison["disagreementType"] = undefined;
              if (!agreement) {
                if (jaccardClustered && affinity.relationship !== "same_event") {
                  disagreementType = "false_positive_jaccard";
                  shadowReport.potentialFalsePositives++;
                } else if (!jaccardClustered && isJevSameEvent) {
                  disagreementType = "false_negative_jaccard";
                  shadowReport.potentialFalseNegatives++;
                }
              }

              shadowReport.totalEvaluated++;
              if (agreement) {
                shadowReport.agreements++;
              } else {
                shadowReport.disagreements++;
              }

              shadowReport.comparisons.push({
                primaryItemId: item.id,
                candidateItemId: candidate.id,
                primaryTitle: item.title || "Untitled",
                candidateTitle: candidate.title || "Untitled",
                jaccardOverlap: overlap,
                jaccardClustered,
                jevRelationship: affinity.relationship,
                jevCorroboration: affinity.corroboration,
                jevConfidence: affinity.relationshipConfidence,
                jevProbability: affinity.relationshipProbability,
                agreement,
                disagreementType,
              });

              // Map fact corroboration
              let factStatus: SourcedFact["corroborationStatus"] = "additive";
              if (affinity.corroboration === "corroborates") {
                factStatus = "verified";
              } else if (affinity.corroboration === "contradicts" && affinity.corroborationConfidence >= 0.80) {
                factStatus = "contradicted";
              }
              itemCorroborationMap.set(candidate.id, {
                status: factStatus,
                confidence: affinity.corroborationConfidence,
              });

              // In active mode, override clustering with high confidence Jev verdicts
              if (configuredMode === "active") {
                if (disagreementType === "false_negative_jaccard" && affinity.relationshipConfidence >= 0.85) {
                  memberIncluded = true;
                } else if (disagreementType === "false_positive_jaccard" && affinity.relationshipConfidence >= 0.85 && affinity.relationship === "unrelated") {
                  memberIncluded = false;
                }
              }
            }
          } catch (err) {
            console.warn("[story-clusterer] Shadow evaluation skipped on error:", err);
          }
        }

        if (memberIncluded) {
          clusterMembers.push(candidate);
          assignedItemIds.add(candidate.id);
        }
      }

      const primary = clusterMembers[0];
      const newestTimestamp = Math.max(...clusterMembers.map((member) => member.publishedAt?.getTime() ?? 0));
      const ageHours = Math.max(0, (Date.now() - newestTimestamp) / (60 * 60 * 1000));

      const facts: SourcedFact[] = clusterMembers
        .map((member, idx) => {
          if (idx === 0) {
            return {
              claim: member.title || "Key finding",
              sourceUrl: member.url || undefined,
              entity: primary.title?.split(" ")[0] || undefined,
              corroborationStatus: "verified" as const,
              semanticConfidence: 1.0,
            };
          }
          const corroboration = itemCorroborationMap.get(member.id);
          return {
            claim: member.title || "Key finding",
            sourceUrl: member.url || undefined,
            entity: member.title?.split(" ")[0] || primary.title?.split(" ")[0] || undefined,
            corroborationStatus: corroboration?.status ?? ("unverified" as const),
            semanticConfidence: corroboration?.confidence,
          };
        })
        .filter((fact) => fact.corroborationStatus !== "contradicted");

      clusters.push({
        title: primary.title || "Trending Topic",
        summary: primary.body?.slice(0, 300) || primary.title || "",
        memberItemIds: clusterMembers.map((member) => member.id),
        facts,
        freshnessScore: Math.max(0, Math.round((10 - ageHours / 4) * 100) / 100),
      });
    }

    // Insert clusters in a single write operation
    await db.transaction(async (tx) => {
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
    });

    return {
      themePageId,
      clusteredCount: claimedItems.length,
      clustersCreated: clusters.length,
      ...(shadowReport.totalEvaluated > 0 ? { shadowReport } : {}),
    };
  } catch (error) {
    // Rollback claimed items to "raw" so retry attempts don't leave items stranded
    try {
      await db.update(sourceItems)
        .set({ status: "raw" })
        .where(and(
          eq(sourceItems.tenantId, tenantId),
          eq(sourceItems.themePageId, themePageId),
          eq(sourceItems.status, "clustered"),
          inArray(sourceItems.id, claimedItems.map((item) => item.id)),
        ));
    } catch (rollbackErr) {
      console.error("[story-clusterer] Failed to rollback claimed items to raw:", rollbackErr);
    }
    throw error;
  }
}

