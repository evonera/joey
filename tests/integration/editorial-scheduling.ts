import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, user, member, socialAccounts, drafts, editorialPreferences } = await import("../../src/lib/db/schema");
const { draftScheduleRevision, scheduleApprovedDraft } = await import("../../src/lib/editorial-scheduling");
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
