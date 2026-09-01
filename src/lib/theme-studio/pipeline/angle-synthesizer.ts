import { db } from "@/lib/db";
import { contentPackages, storyClusters, themeSlots, themePages, sourceItems } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { verifyRightsAndProvenance } from "./fact-rights-verifier";

export interface PackageGenerationResult {
  packagesCreated: number;
  packageIds: string[];
  skippedSlotsCount: number;
}

/**
 * Synthesizes story angles into structured content packages matching daily mix slots.
 */
export async function synthesizeAndAllocatePackages(themePageId: string): Promise<PackageGenerationResult> {
  const page = await db.query.themePages.findFirst({
    where: eq(themePages.id, themePageId),
  });
  if (!page) throw new Error("Theme page not found");

  const slots = await db.query.themeSlots.findMany({
    where: and(eq(themeSlots.themePageId, themePageId), eq(themeSlots.isActive, true)),
    orderBy: [themeSlots.priority],
  });

  const openClusters = await db.query.storyClusters.findMany({
    where: and(eq(storyClusters.themePageId, themePageId), eq(storyClusters.status, "open")),
    orderBy: [desc(storyClusters.createdAt)],
    limit: 10,
  });

  if (slots.length === 0 || openClusters.length === 0) {
    return { packagesCreated: 0, packageIds: [], skippedSlotsCount: slots.length };
  }

  const packageIds: string[] = [];
  let skippedSlotsCount = 0;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const cluster = openClusters[i % openClusters.length]; // cycle if fewer clusters than slots

    const memberIds = Array.isArray(cluster.memberItemIds) ? (cluster.memberItemIds as string[]) : [];
    let memberItems: any[] = [];
    if (memberIds.length > 0) {
      memberItems = await db.query.sourceItems.findMany({
        where: inArray(sourceItems.id, memberIds),
      });
    }

    const memberRights = memberItems.map((m) => m.rightsCategory || "unknown");
    const dominantRights = memberRights.length > 0 ? memberRights[0] : "unknown";
    const hasSourceUrl = memberItems.length > 0 && memberItems.every((m) => Boolean(m.url && m.url.trim()));
    const hasTimestamp = memberItems.length > 0 && memberItems.every((m) => Boolean(m.publishedAt));

    const verification = verifyRightsAndProvenance({
      rightsCategory: dominantRights,
      policy: (page.defaultRightsPolicy as any) || "strict",
      hasSourceUrl,
      hasTimestamp,
    });

    if (!verification.isCompliant) {
      skippedSlotsCount++;
      continue;
    }

    const title = `${cluster.title}`;
    const hashtags = [
      `#${(page.niche || "daily").replace(/\s+/g, "").toLowerCase()}`,
      "#trending",
      "#updates",
    ];

    const caption = `${title}\n\n${cluster.summary || ""}\n\n${verification.attributionText || ""}\n\n${hashtags.join(" ")}`;

    const [pkg] = await db.insert(contentPackages).values({
      tenantId: page.tenantId,
      themePageId,
      slotId: slot.id,
      clusterId: cluster.id,
      formatId: slot.formatId,
      templateId: slot.overrideTemplateId || null,
      title,
      caption,
      hashtags,
      renderedAssetUrls: [],
      provenance: {
        clusterId: cluster.id,
        sourcesCount: memberItems.length || 1,
        factsCount: Array.isArray(cluster.facts) ? cluster.facts.length : 0,
        policy: page.defaultRightsPolicy,
        rightsVerified: dominantRights,
        isCompliant: verification.isCompliant,
        attributionText: verification.attributionText || null,
        generatedAt: new Date().toISOString(),
      },
      status: "pending_review",
    }).returning();

    packageIds.push(pkg.id);

    await db
      .update(storyClusters)
      .set({ status: "allocated", updatedAt: new Date() })
      .where(eq(storyClusters.id, cluster.id));
  }

  return {
    packagesCreated: packageIds.length,
    packageIds,
    skippedSlotsCount,
  };
}
