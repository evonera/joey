import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentPackages, scoutRemixes, storyClusters } from "@/lib/db/schema";
import type { ScoutAlert } from "./evaluator";
import type { AgencyDb } from "@/lib/agency/service";

export function scoutRemixEventKey(targetUrl: string, goal: string, alert: ScoutAlert): string {
  let source = alert.samplePost?.url;
  if (source) {
    try {
      const url = new URL(source);
      url.search = "";
      url.hash = "";
      source = url.toString().replace(/\/$/, "");
      let target: URL | undefined;
      try { target = new URL(targetUrl); target.search = ""; target.hash = ""; } catch { /* A valid post URL remains a usable identity. */ }
      // Apify falls back to the monitored profile when no post URL exists.
      // That is a source account, not the identity of each distinct post.
      if (target && source === target.toString().replace(/\/$/, "")) source = undefined;
    } catch {
      source = undefined;
    }
  }
  // Counts and detection times change on every poll, but do not create a new
  // source story. A configured target/goal change does change the identity.
  const identity = source || alert.samplePost?.content?.trim() || alert.title.trim();
  return createHash("sha256")
    .update(JSON.stringify([targetUrl, goal, identity]))
    .digest("hex");
}

export async function claimScoutRemixRender(receipt: typeof scoutRemixes.$inferSelect) {
  const now = new Date();
  const [claimed] = await db.update(scoutRemixes).set({
    status: "rendering", leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + 300_000), error: null, updatedAt: now,
  }).where(and(
    eq(scoutRemixes.id, receipt.id), eq(scoutRemixes.tenantId, receipt.tenantId),
    sql`${scoutRemixes.packageId} IS NOT NULL`,
    // Recovery is draft-only, including when a review decision races a replay.
    sql`EXISTS (SELECT 1 FROM ${contentPackages} WHERE ${contentPackages.id} = ${scoutRemixes.packageId} AND ${contentPackages.tenantId} = ${scoutRemixes.tenantId} AND ${contentPackages.status} IN ('pending_review', 'failed'))`,
    or(inArray(scoutRemixes.status, ["prepared", "failed"]), and(inArray(scoutRemixes.status, ["rendering", "queued"]), lte(scoutRemixes.leaseExpiresAt, now))),
  )).returning();
  return claimed;
}

export async function claimScoutRemix(input: {
  tenantId: string;
  scoutId: string;
  themePageId: string;
  eventKey: string;
}) {
  const token = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 300_000);
  const [created] = await db
    .insert(scoutRemixes)
    .values({ ...input, leaseToken: token, leaseExpiresAt })
    .onConflictDoNothing()
    .returning();
  if (created) return { claimed: true, receipt: created };
  const existing = await db.query.scoutRemixes.findFirst({
    where: and(
      eq(scoutRemixes.tenantId, input.tenantId),
      eq(scoutRemixes.scoutId, input.scoutId),
      eq(scoutRemixes.themePageId, input.themePageId),
      eq(scoutRemixes.eventKey, input.eventKey)
    ),
  });
  if (!existing) throw new Error("Remix receipt unavailable; try again.");
  // Once a draft exists, retries must reuse it, never generate another one.
  if (existing.packageId || !["processing", "failed"].includes(existing.status))
    return { claimed: false, receipt: existing };
  const [claimed] = await db
    .update(scoutRemixes)
    .set({ status: "processing", leaseToken: token, leaseExpiresAt, error: null, updatedAt: now })
    .where(
      and(
        eq(scoutRemixes.id, existing.id),
        eq(scoutRemixes.tenantId, input.tenantId),
        sql`${scoutRemixes.packageId} IS NULL`,
        or(
          eq(scoutRemixes.status, "failed"),
          and(eq(scoutRemixes.status, "processing"), lte(scoutRemixes.leaseExpiresAt, now))
        )
      )
    )
    .returning();
  return { claimed: Boolean(claimed), receipt: claimed ?? existing };
}

export async function saveScoutRemixDraft(
  receipt: typeof scoutRemixes.$inferSelect,
  cluster: typeof storyClusters.$inferInsert,
  pkg: Omit<typeof contentPackages.$inferInsert, "clusterId">,
  beforeCommit?: (tx: AgencyDb) => Promise<void>,
  afterCommit?: (tx: AgencyDb, packageId: string) => Promise<void>
) {
  return db.transaction(async (tx) => {
    // Governance lock precedes the receipt/package locks everywhere.
    await beforeCommit?.(tx);
    const [owned] = await tx
      .update(scoutRemixes)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(scoutRemixes.id, receipt.id),
          eq(scoutRemixes.tenantId, receipt.tenantId),
          eq(scoutRemixes.leaseToken, receipt.leaseToken),
          eq(scoutRemixes.status, "processing"),
          sql`${scoutRemixes.leaseExpiresAt} > now()`
        )
      )
      .returning();
    if (!owned) throw new Error("Remix lease expired or was replaced. Try again.");
    if (
      cluster.tenantId !== receipt.tenantId ||
      cluster.themePageId !== receipt.themePageId ||
      pkg.tenantId !== receipt.tenantId ||
      pkg.themePageId !== receipt.themePageId
    )
      throw new Error("Remix ownership mismatch.");
    const [savedCluster] = await tx.insert(storyClusters).values(cluster).returning();
    const [savedPackage] = await tx
      .insert(contentPackages)
      .values({ ...pkg, clusterId: savedCluster.id })
      .returning();
    await afterCommit?.(tx, savedPackage.id);
    await tx
      .update(scoutRemixes)
      .set({ status: "prepared", packageId: savedPackage.id, clusterId: savedCluster.id, updatedAt: new Date() })
      .where(and(eq(scoutRemixes.id, receipt.id), eq(scoutRemixes.leaseToken, receipt.leaseToken)));
    return { cluster: savedCluster, pkg: savedPackage };
  });
}

export async function finishScoutRemix(
  receipt: typeof scoutRemixes.$inferSelect,
  status: "queued" | "complete" | "failed",
  error?: string
) {
  await db
    .update(scoutRemixes)
    .set({ status, error: error?.slice(0, 500) ?? null, updatedAt: new Date() })
    .where(
      and(
        eq(scoutRemixes.id, receipt.id),
        eq(scoutRemixes.tenantId, receipt.tenantId),
        eq(scoutRemixes.leaseToken, receipt.leaseToken),
        inArray(scoutRemixes.status, ["processing", "rendering"])
      )
    );
}
