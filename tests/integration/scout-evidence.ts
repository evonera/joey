import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";

await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, scouts, scoutEvaluations, notifications } = await import("../../src/lib/db/schema");
const { eq } = await import("drizzle-orm");
const { reserveScoutEvaluation, claimScoutEvaluation, markScoutEvaluationPhase, completeScoutEvaluation, failScoutEvaluation } = await import("../../src/lib/scouts/evaluation-receipts");
const tenantId = crypto.randomUUID();

try {
  await db.insert(tenants).values({ id: tenantId, name: "Disposable Scout evidence acceptance", slug: tenantId });
  const [source] = await db.insert(scouts).values({ tenantId, name: "Feed evidence", platform: "rss", targetUrl: "https://example.com/feed", goalCondition: "New articles", isActive: false }).returning();
  const expired = new Date(Date.now() - 24 * 60 * 60_000);
  for (const [index, postId] of ["a", "b", "a"].entries()) {
    const scout = await db.query.scouts.findFirst({ where: eq(scouts.id, source.id) });
    assert(scout);
    const receipt = await reserveScoutEvaluation(scout, `evidence:${index}`);
    const claim = await claimScoutEvaluation(receipt);
    assert(claim.claimed);
    const items = [{ id: postId, url: `https://example.com/${postId}`, text: `Article ${postId}`, observedAt: new Date().toISOString() }];
    const collected = await markScoutEvaluationPhase(claim.receipt, "collected", items);
    await completeScoutEvaluation(collected, scout, {
      triggered: true, itemsFound: 1,
      alert: { title: `Model wording ${index}`, detectedAt: new Date().toISOString(), targetUrl: scout.targetUrl, platform: scout.platform, goal: scout.goalCondition, changes: [{ type: "ADDED", label: `Different wording ${index}`, after: items[0].text, rationale: "Saved article" }], samplePost: { url: items[0].url, content: items[0].text } },
    });
    await db.update(scoutEvaluations).set({ createdAt: expired }).where(eq(scoutEvaluations.id, receipt.id));
  }
  const savedNotifications = await db.select().from(notifications).where(eq(notifications.tenantId, tenantId));
  assert.equal(savedNotifications.length, 2, "A → B → A evidence creates two alerts even when model wording changes");

  const current = await db.query.scouts.findFirst({ where: eq(scouts.id, source.id) });
  assert(current);
  const failedClaim = await claimScoutEvaluation(await reserveScoutEvaluation(current, "fetch-failure"));
  assert(failedClaim.claimed);
  const collecting = await markScoutEvaluationPhase(failedClaim.receipt, "collecting");
  const failed = await failScoutEvaluation(collecting, "Fixture fetch failed");
  assert.equal(failed?.status, "uncertain", "collection failures do not replay automatically");
  const afterFailure = await db.query.scouts.findFirst({ where: eq(scouts.id, source.id) });
  assert(afterFailure?.lastPolledAt);
  assert(afterFailure.lastPolledAt.getTime() > current.lastPolledAt!.getTime(), "the failed fetch advances the poll interval");
  assert.equal(afterFailure.updatedAt.getTime(), current.updatedAt.getTime(), "poll backoff does not masquerade as a user edit");
  assert.equal(await failScoutEvaluation(collecting, "Duplicate failure"), undefined, "a late worker cannot reapply failure");

  const changedClaim = await claimScoutEvaluation(await reserveScoutEvaluation(afterFailure, "retargeted-failure"));
  assert(changedClaim.claimed);
  const retargetPoll = new Date(Date.now() - 60_000);
  await db.update(scouts).set({ targetUrl: "https://example.com/new-feed", lastPolledAt: retargetPoll }).where(eq(scouts.id, source.id));
  await failScoutEvaluation(changedClaim.receipt, "Old configuration failed");
  const retargeted = await db.query.scouts.findFirst({ where: eq(scouts.id, source.id) });
  assert.equal(retargeted?.lastPolledAt?.getTime(), retargetPoll.getTime(), "an old fetch failure does not delay a retargeted source");
  console.log("PASS: durable A → B → A alert deduplication, failed-fetch backoff, stale worker and retarget fencing");
} finally {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}
process.exit(0);
