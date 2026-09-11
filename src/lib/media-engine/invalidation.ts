import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentPackages } from "@/lib/db/schema";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Called in the same short transaction as a template/page/format mutation.
 * A publication claim that wins first keeps its accepted snapshot. Otherwise
 * this touches updatedAt and approval, fencing concurrent review/publication.
 */
export async function invalidateThemeMedia(tx: Transaction, tenantId: string, source: { kind: "page" | "template" | "format"; id: string }, pixels: boolean) {
  const column = source.kind === "page" ? contentPackages.themePageId : source.kind === "template" ? contentPackages.templateId : contentPackages.formatId;
  await tx.update(contentPackages).set({
    status: "pending_review", error: null, updatedAt: new Date(),
    ...(pixels ? { renderedAssetUrls: [], metrics: sql`(coalesce(${contentPackages.metrics}, '{}'::jsonb) - 'renderJobId' - 'renderRevision') || '{"failurePhase":"render_required"}'::jsonb` } : {}),
  }).where(and(eq(contentPackages.tenantId, tenantId), eq(column, source.id), inArray(contentPackages.status, ["pending_review", "approved", "rejected", "failed"]), sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`));
}
