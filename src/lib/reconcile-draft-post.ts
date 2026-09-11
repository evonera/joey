import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { drafts, posts } from "@/lib/db/schema";
import { draftStatusFromZernio, getZernioClientForTenant } from "@/lib/publisher-core";
import type { ZernioWebhookPayload } from "@/lib/webhooks";

export async function reconcileDraftPostEvent(payload: ZernioWebhookPayload, tenantId: string) {
  if (!payload.event.startsWith("post.")) return;
  const post = payload.post as { id?: string; _id?: string; metadata?: { draftId?: string } } | undefined;
  const draftId = post?.metadata?.draftId;
  if (!draftId) return;
  const draft = await db.query.drafts.findFirst({ where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)) });
  if (!draft) return;
  const recorded = await db.query.posts.findFirst({ where: and(eq(posts.draftId, draftId), eq(posts.tenantId, tenantId)) });
  const postId = recorded?.zernioPostId || post?.id || post?._id;
  if (!postId) return;
  await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT id FROM ${drafts} WHERE id = ${draftId} AND tenant_id = ${tenantId} FOR UPDATE`);
  const { zernio } = await getZernioClientForTenant(tenantId);
  const response = await zernio.posts.getPost({ path: { postId } });
  if (response.error || !response.data?.post) throw new Error("Could not reconcile draft publishing status");
  const current = response.data.post;
  const status = draftStatusFromZernio(current.status);
  if ((current.metadata as { draftId?: string } | undefined)?.draftId !== draftId) throw new Error("Post does not belong to this draft");
    await tx.update(drafts).set({
      status,
      errorMessage: status === "failed" ? "Zernio reported a publishing failure. Review the post before retrying." : null,
    }).where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));
    const saved = await tx.query.posts.findFirst({ where: and(eq(posts.draftId, draftId), eq(posts.tenantId, tenantId)) });
    if (saved) {
      await tx.update(posts).set({ status, ...(status === "published" ? { publishedAt: saved.status === "published" ? saved.publishedAt : new Date() } : {}) }).where(eq(posts.id, saved.id));
    } else {
      // Preserve the provider ID even if the original publishing worker crashed
      // before recording its HTTP response. Future retries reconcile this post.
      await tx.insert(posts).values({ tenantId, draftId, zernioPostId: postId, content: draft.content || "", status });
    }
  });
}
