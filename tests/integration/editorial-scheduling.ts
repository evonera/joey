import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, user, member, socialAccounts, drafts, posts, editorialPreferences } = await import("../../src/lib/db/schema");
const { draftScheduleRevision, scheduleApprovedDraft, occupiedAccountTimes } = await import("../../src/lib/editorial-scheduling");
const { reviewDraft } = await import("../../src/lib/draft-review");
const { eq } = await import("drizzle-orm");
const tenantId = crypto.randomUUID(); const ownerId = crypto.randomUUID(); const foreignId = crypto.randomUUID();
let failed = false;
try {
  await db.insert(tenants).values({ id: tenantId, name: "Disposable editorial acceptance" });
  await db.insert(user).values([ownerId, foreignId].map(id => ({ id, name: "Fixture", email: `${id}@example.invalid`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() })));
  await db.insert(member).values({ id: crypto.randomUUID(), organizationId: tenantId, userId: ownerId, role: "owner", createdAt: new Date() });
  const [account, other] = await db.insert(socialAccounts).values(["one", "two"].map(name => ({ tenantId, platform: "x", platformAccountId: name, accountName: name }))).returning();
  const preferences = { timezone: "UTC", spacingMinutes: 360, windows: Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 0, endMinute: 1440 })) };
  await db.insert(editorialPreferences).values([account, other].map(a => ({ tenantId, accountId: a.id, preferences })));
  const [first, second, third] = await db.insert(drafts).values([account, account, other].map(a => ({ tenantId, content: "Reviewed fixture", status: "approved", platformOptions: { accountId: a.id, platform: "x" } }))).returning();
  const slot = new Date(Math.ceil((Date.now() + 86_400_000) / 900_000) * 900_000);
  const confirm = (draft: typeof first, userId = ownerId, revision = draftScheduleRevision(draft)) => db.transaction(tx => scheduleApprovedDraft(tx, tenantId, userId, draft.id, revision, slot));
  const races = await Promise.allSettled([confirm(first), confirm(second)]);
  assert.equal(races.filter(r => r.status === "fulfilled").length, 1, "same-account confirmations must serialize, not double-book");
  await confirm(third);
  const legacyTime = new Date(slot.getTime() + 86_400_000);
  const [legacy] = await db.insert(drafts).values({ tenantId, status: "approved", content: "REST target fixture", platformOptions: { accountIds: [account.id] }, scheduledFor: legacyTime }).returning();
  const range = () => db.transaction(tx => occupiedAccountTimes(tx, tenantId, account.id, new Date(legacyTime.getTime() - 1000), new Date(legacyTime.getTime() + 1000)));
  assert.equal((await range()).length, 1, "supported accountIds proposals must occupy their account");
  await db.update(drafts).set({ status: "published", scheduledFor: null }).where(eq(drafts.id, legacy.id));
  await db.insert(posts).values({ tenantId, draftId: legacy.id, content: "Published REST target fixture", publishedAt: legacyTime, status: "published" });
  assert.equal((await range()).length, 1, "supported accountIds published history must occupy its account");

  const [raceAccount] = await db.insert(socialAccounts).values({ tenantId, platform: "x", platformAccountId: "approval-race" }).returning();
  await db.insert(editorialPreferences).values({ tenantId, accountId: raceAccount.id, preferences });
  const [proposal, candidate] = await db.insert(drafts).values([
    { tenantId, status: "pending_review", content: "Scheduled proposal", platformOptions: { accountIds: [raceAccount.id] }, scheduledFor: slot },
    { tenantId, status: "approved", content: "Assisted candidate", platformOptions: { accountId: raceAccount.id } },
  ]).returning();
  await Promise.allSettled([
    reviewDraft({ tenantId, draftId: proposal.id, decision: "approve" }),
    confirm(candidate),
  ]);
  const current = await db.query.drafts.findMany();
  assert.equal(current.filter(d => [proposal.id, candidate.id].includes(d.id) && ["approved", "scheduled"].includes(d.status) && d.scheduledFor).length, 1, "approval and confirmation must not create two publishable same-account schedules");
  const blocked = races[0].status === "rejected" ? first : second;
  await assert.rejects(confirm(blocked, foreignId), /current workspace owners/);
  await db.update(drafts).set({ content: "Changed after recommendation" }).where(eq(drafts.id, blocked.id));
  await assert.rejects(confirm(blocked), /draft changed/);
  const [changed] = await db.select().from(drafts).where(eq(drafts.id, blocked.id));
  await db.update(socialAccounts).set({ isActive: false }).where(eq(socialAccounts.id, account.id));
  await assert.rejects(confirm(changed), /disconnected/);
  await db.update(socialAccounts).set({ isActive: true }).where(eq(socialAccounts.id, account.id));
  await db.update(member).set({ role: "member" }).where(eq(member.userId, ownerId));
  await assert.rejects(confirm(changed), /current workspace owners/);
  console.log("PASS: PostgreSQL account-lock concurrency, independent accounts, stale revision, disconnected account, foreign user and revoked authority.");
} catch (error) { failed = true; console.error(error); }
finally {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, ownerId)); await db.delete(user).where(eq(user.id, foreignId));
  process.exit(failed ? 1 : 0);
}
