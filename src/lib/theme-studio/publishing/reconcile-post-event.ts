import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentPackages } from "@/lib/db/schema";
import { draftStatusFromZernio, getZernioClientForTenant } from "@/lib/publisher-core";
import type { ZernioWebhookPayload } from "@/lib/webhooks";

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function reconcileThemePackagePostEvent(payload: { event: string; post?: unknown }, tenantId: string): Promise<void> {
  if (!payload.event.startsWith("post.")) return;
  const eventPost = record(payload.post);
  const packageId = text(record(eventPost.metadata).themePackageId);
  if (!packageId) return;
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM ${contentPackages} WHERE id = ${packageId} AND tenant_id = ${tenantId} FOR UPDATE`);
    const pkg = await tx.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
    if (!pkg) return;
    const priorMetrics = record(pkg.metrics);
    const postId = text(priorMetrics.zernioPostId) || text(eventPost.id) || text(eventPost._id);
    if (!postId) throw new Error("Theme package webhook is missing its post ID");
    const { zernio } = await getZernioClientForTenant(tenantId);
    // A single platform success is not an aggregate success. Fetch current state
    // under the package lock so delayed webhooks cannot replay stale statuses.
    const response = await zernio.posts.getPost({ path: { postId } });
    const post = response.data?.post;
    if (response.error || !post) throw new Error("Could not reconcile Theme Studio publishing status");
    if (record(post.metadata).themePackageId !== packageId) throw new Error("Post does not belong to this content package");
    const status = draftStatusFromZernio(post.status);
    const publishedTarget = post.platforms?.find((target: { status?: string; platformPostId?: string; platformPostUrl?: string }) => target.status === "published");
    await tx.update(contentPackages).set({
      status,
      error: status === "failed" ? "One or more destinations failed. Review the existing post in Zernio before retrying." : null,
      publishedAt: status === "published" ? (pkg.publishedAt || new Date()) : null,
      publishedPostId: publishedTarget?.platformPostId || pkg.publishedPostId || post._id,
      metrics: { ...priorMetrics, zernioPostId: post._id, ...(publishedTarget?.platformPostUrl ? { publishedUrl: publishedTarget.platformPostUrl } : {}) },
      updatedAt: new Date(),
    }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)));
  });
}
