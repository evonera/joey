import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import { tenants, engagementItems, replyDrafts, socialAccounts } from "../../src/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { draftReplyForItem, editUnsentReply, approveReviewedReply, replaceReplyDraftSnapshot } from "../../src/lib/reply-drafts";
import { sendApprovedReply, recoverStaleEngagementSends, ENGAGEMENT_SEND_LEASE_MS } from "../../src/lib/engagement-delivery";

/** Caller first verifies a disposable database. All provider calls are fake. */
export async function verifyReplyDeliverySafety() {
  const tenantId = crypto.randomUUID();
  try {
    await db.insert(tenants).values({ id: tenantId, name: "Reply delivery safety", slug: tenantId });
    const [account] = await db.insert(socialAccounts).values({ tenantId, platform: "instagram", platformAccountId: "fake-account", accountName: "Fake account", isActive: true }).returning();
    const comment = async () => {
      const [item] = await db.insert(engagementItems).values({ tenantId, socialAccountId: account.id, platform: "instagram", platformPostId: "fake-post", platformCommentId: crypto.randomUUID(), text: "A comment" }).returning();
      return item;
    };
    const load = (id: string) => db.query.replyDrafts.findFirst({ where: eq(replyDrafts.id, id) });
    const prepare = async () => {
      const item = await comment();
      const result = await draftReplyForItem(tenantId, item.id, "Reviewed reply", null);
      assert(result.replyDraftId);
      assert(await approveReviewedReply(tenantId, result.replyDraftId, "Reviewed reply"));
      return { item, id: result.replyDraftId };
    };
    const assertImmutable = async (id: string, itemId: string) => {
      const snapshot = await load(id); assert(snapshot);
      assert.equal(await editUnsentReply(tenantId, id, "Changed payload"), undefined);
      assert.equal(await replaceReplyDraftSnapshot(tenantId, snapshot, "AI changed payload", null), undefined);
      assert.equal(await approveReviewedReply(tenantId, id, snapshot.content), undefined);
      assert.equal((await draftReplyForItem(tenantId, itemId, "Another AI payload", null)).success, false);
      let calls = 0;
      const result = await sendApprovedReply(tenantId, id, async () => { calls++; throw new Error("Must not reach provider"); });
      assert.ok(result.error); assert.equal(calls, 0);
      assert.equal((await load(id))?.content, "Reviewed reply");
    };

    // Expiry must not permit a different payload; a late success can still
    // finish its original immutable claim after the reaper has run.
    const active = await prepare();
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    let sends = 0;
    const sending = sendApprovedReply(tenantId, active.id, async () => ({ zernio: { comments: { replyToInboxPost: async (request: any) => {
      sends++; assert.equal(request.body.message, "Reviewed reply"); started(); await gate; return { data: { success: true } };
    } } } }) as any);
    await entered;
    const originalClaim = (await load(active.id))?.sendClaimedAt;
    try {
      await recoverStaleEngagementSends(new Date(Date.now() + ENGAGEMENT_SEND_LEASE_MS + 1000));
      assert.equal((await load(active.id))?.status, "failed");
      assert.equal((await load(active.id))?.sendClaimedAt?.getTime(), originalClaim?.getTime());
      await assertImmutable(active.id, active.item.id);
    } finally { release(); }
    assert.equal((await sending).success, true);
    assert.equal((await load(active.id))?.status, "sent");
    assert.equal((await db.query.engagementItems.findFirst({ where: eq(engagementItems.id, active.item.id) }))?.status, "replied");
    assert.equal(sends, 1);
    const lateDrafts = await Promise.all(Array.from({ length: 12 }, () => draftReplyForItem(tenantId, active.item.id, "Late generated reply", null)));
    assert(lateDrafts.every(result => !result.success));
    assert.equal((await db.query.replyDrafts.findMany({ where: eq(replyDrafts.engagementItemId, active.item.id) })).length, 1);
    // Even a stale item status cannot hide the persisted sent receipt.
    await db.update(engagementItems).set({ status: "pending" }).where(eq(engagementItems.id, active.item.id));
    assert.equal((await draftReplyForItem(tenantId, active.item.id, "Duplicate", null)).success, false);

    const [legacyDuplicate] = await db.insert(replyDrafts).values({ tenantId, engagementItemId: active.item.id, content: "Legacy duplicate", status: "approved" }).returning();
    let duplicateCalls = 0;
    const duplicateSend = await sendApprovedReply(tenantId, legacyDuplicate.id, async () => { duplicateCalls++; throw new Error("Must not dispatch a duplicate"); });
    assert(duplicateSend.error?.includes("already has a sent reply"));
    assert.equal(duplicateCalls, 0);

    const ambiguous = await prepare();
    let acceptedCalls = 0;
    const failed = await sendApprovedReply(tenantId, ambiguous.id, async () => ({ zernio: { comments: { replyToInboxPost: async () => { acceptedCalls++; throw new Error("Connection lost after remote acceptance"); } } } }) as any);
    assert(failed.error?.includes("uncertain"));
    assert.equal(acceptedCalls, 1);
    assert((await load(ambiguous.id))?.sendClaimedAt);
    await assertImmutable(ambiguous.id, ambiguous.item.id);

    const legacy = await prepare();
    await db.update(replyDrafts).set({ status: "failed", sendClaimedAt: null }).where(eq(replyDrafts.id, legacy.id));
    await assertImmutable(legacy.id, legacy.item.id);

    const beforeDispatch = await prepare();
    const noClient = await sendApprovedReply(tenantId, beforeDispatch.id, async () => { throw new Error("Missing provider configuration"); });
    assert.equal(noClient.error, "Missing provider configuration");
    assert.equal((await load(beforeDispatch.id))?.status, "pending_review");
    assert.equal((await load(beforeDispatch.id))?.sendClaimedAt, null);
    assert(await editUnsentReply(tenantId, beforeDispatch.id, "Explicitly revised reply"));
    assert(await approveReviewedReply(tenantId, beforeDispatch.id, "Explicitly revised reply"));
    assert.equal((await sendApprovedReply(tenantId, beforeDispatch.id, async () => ({ zernio: { comments: { replyToInboxPost: async (request: any) => { assert.equal(request.body.message, "Explicitly revised reply"); return {}; } } } }) as any)).success, true);

    const fresh = await comment();
    const creations = await Promise.all(Array.from({ length: 16 }, () => draftReplyForItem(tenantId, fresh.id, "One draft", null)));
    assert.equal(creations.filter(result => "created" in result && result.created).length, 1);
    assert.equal((await db.query.replyDrafts.findMany({ where: and(eq(replyDrafts.tenantId, tenantId), eq(replyDrafts.engagementItemId, fresh.id)) })).length, 1);
    const alreadyReplied = await comment();
    await db.update(engagementItems).set({ status: "replied" }).where(eq(engagementItems.id, alreadyReplied.id));
    assert.equal((await draftReplyForItem(tenantId, alreadyReplied.id, "Duplicate", null)).success, false);
    console.log("PASS: immutable uncertain and legacy failures, safe pre-dispatch retry, late provider confirmation, terminal reply deduplication and concurrent draft admission.");
  } finally { await db.delete(tenants).where(eq(tenants.id, tenantId)); }
}
