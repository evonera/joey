import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, user, member, engagementItems, replyDrafts } = await import("../../src/lib/db/schema");
const { eq } = await import("drizzle-orm");
const { replaceReplyDraftSnapshot, approveReviewedReply } = await import("../../src/lib/reply-drafts");
const { auth } = await import("../../src/lib/auth");
const id = crypto.randomUUID();
let userId: string | undefined;
try {
  const signup = await auth.api.signUpEmail({
    body: { name: "Safety fixture", email: `${id}@example.test`, password: `Fixture-only-${id}` },
    asResponse: true,
  });
  assert.equal(signup.status, 200);
  userId = (await signup.json()).user.id;
  const cookies = signup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert(cookies);
  assert.equal((await auth.api.getSession({ headers: new Headers({ cookie: cookies }) }))?.user.id, userId);
  await db.insert(tenants).values({ id, name: "Disposable safety fixture", slug: id });
  await db.insert(member).values({ id: crypto.randomUUID(), userId: userId!, organizationId: id, role: "owner", createdAt: new Date() });
  for (const status of ["active", "on_hold", "cancelled"]) {
    await db.update(tenants).set({ subscriptionPlan: "creator", subscriptionStatus: status, dodoCustomerId: "cus_fixture", dodoSubscriptionId: "sub_fixture", dodoCheckoutId: "checkout_fixture" }).where(eq(tenants.id, id));
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/organization/delete", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: cookies }, body: JSON.stringify({ organizationId: id }),
    }));
    assert.equal(response.status, 404, `generic deletion must be disabled for ${status}`);
    assert.equal((await response.json()).code, "ORGANIZATION_DELETION_DISABLED");
    const retained = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });
    assert.equal(retained?.dodoSubscriptionId, "sub_fixture");
    assert.equal(retained?.dodoCheckoutId, "checkout_fixture");
    assert.equal((await db.query.member.findMany({ where: eq(member.organizationId, id) })).length, 1);
  }
  const [item] = await db.insert(engagementItems).values({ tenantId: id, platform: "instagram", text: "A comment" }).returning();
  const createReply = async () => {
    // A distinct comment keeps the active-draft uniqueness constraint meaningful.
    const [comment] = await db.insert(engagementItems).values({ tenantId: id, platform: "instagram", text: item.text }).returning();
    const [reply] = await db.insert(replyDrafts).values({ tenantId: id, engagementItemId: comment.id, content: "Reviewed original" }).returning();
    return reply;
  };
  for (const status of ["approved", "sending", "sent"]) {
    const snapshot = await createReply();
    await db.update(replyDrafts).set({ status }).where(eq(replyDrafts.id, snapshot.id));
    assert.equal(await replaceReplyDraftSnapshot(id, snapshot, "Late AI result", null), undefined);
    const retained = await db.query.replyDrafts.findFirst({ where: eq(replyDrafts.id, snapshot.id) });
    assert.equal(retained?.status, status);
    assert.equal(retained?.content, snapshot.content);
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const snapshot = await createReply();
    await Promise.all([
      replaceReplyDraftSnapshot(id, snapshot, "New AI proposal", null),
      approveReviewedReply(id, snapshot.id, snapshot.content),
    ]);
    const result = await db.query.replyDrafts.findFirst({ where: eq(replyDrafts.id, snapshot.id) });
    assert(result);
    assert(result.status === "approved" ? result.content === snapshot.content : result.status === "pending_review" && result.content === "New AI proposal", "approval must never authorize unseen content");
  }
  const edited = await createReply();
  await db.update(replyDrafts).set({ content: "Human edit" }).where(eq(replyDrafts.id, edited.id));
  assert.equal(await replaceReplyDraftSnapshot(id, edited, "Stale AI result", null), undefined);
  assert.equal(await approveReviewedReply(id, edited.id, edited.content), undefined);
  assert.equal(await approveReviewedReply("foreign-tenant", edited.id, "Human edit"), undefined);
  assert(await approveReviewedReply(id, edited.id, "Human edit"));
  const { verifyReplyDeliverySafety } = await import("./reply-delivery");
  await verifyReplyDeliverySafety();
  console.log("PASS: authenticated workspace deletion retains billing records; reply approval and AI edits cannot authorize or overwrite unseen content.");
} finally {
  await db.delete(tenants).where(eq(tenants.id, id));
  if (userId) {
    const memberships = await db.query.member.findMany({ where: eq(member.userId, userId) });
    for (const membership of memberships) await db.delete(tenants).where(eq(tenants.id, membership.organizationId));
    await db.delete(user).where(eq(user.id, userId));
  }
}
process.exit(0);
