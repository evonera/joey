import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, engagementItems, socialAccounts, themePages, themeContentFormats, contentPackages } = await import("../../src/lib/db/schema");
const { eq } = await import("drizzle-orm");
const { processThemeStudioDmRetries } = await import("../../src/lib/engagement-inbox");
const tenantId = crypto.randomUUID();
let failed = false;
try {
  await db.insert(tenants).values({ id: tenantId, name: "Private reply audit", slug: tenantId });
  const [expired, legacy, safe, active] = await db.insert(engagementItems).values([
    { tenantId, platform: "instagram", text: "expired", dmDispatchStatus: "sending", dmDispatchAttempts: 1, dmDispatchLeaseExpiresAt: new Date(Date.now() - 60_000) },
    { tenantId, platform: "instagram", text: "legacy", dmDispatchStatus: "failed", dmDispatchAttempts: 1, dmDispatchError: "timeout" },
    { tenantId, platform: "instagram", text: "safe", dmDispatchStatus: "failed", dmDispatchAttempts: 1, dmDispatchError: "pre_dispatch: missing key" },
    { tenantId, platform: "instagram", text: "active", dmDispatchStatus: "sending", dmDispatchAttempts: 1, dmDispatchLeaseExpiresAt: new Date(Date.now() + 60_000) },
  ]).returning();
  const [account] = await db.insert(socialAccounts).values({ tenantId, platform: "instagram", platformAccountId: "fake-account", accountName: "Audit", isActive: true }).returning();
  const [page] = await db.insert(themePages).values({ tenantId, name: "Audit" }).returning();
  const [format] = await db.insert(themeContentFormats).values({ tenantId, name: "Card", slug: "audit", platform: "instagram", mediaType: "image", renderer: "puppeteer", aspectRatio: "4:5" }).returning();
  await db.insert(contentPackages).values({ tenantId, themePageId: page.id, formatId: format.id, title: "Audit", publishedPostId: "post" });
  await db.update(engagementItems).set({ socialAccountId: account.id, platformPostId: "post", platformCommentId: "comment" }).where(eq(engagementItems.id, safe.id));
  let calls = 0;
  const fake = async () => { calls++; return { matched: true, success: true, providerMessageId: "sent-once" }; };
  await Promise.all([processThemeStudioDmRetries(25, fake), processThemeStudioDmRetries(25, fake)]);
  assert.equal(calls, 1, "a safe pre-dispatch failure is claimed once");
  assert.equal((await db.query.engagementItems.findFirst({ where: eq(engagementItems.id, safe.id) }))?.dmDispatchStatus, "sent");
  for (const item of [expired, legacy]) {
    const saved = await db.query.engagementItems.findFirst({ where: eq(engagementItems.id, item.id) });
    assert.equal(saved?.dmDispatchStatus, "uncertain");
    assert.equal(saved?.dmDispatchAttempts, 1);
  }

  assert.equal((await db.query.engagementItems.findFirst({ where: eq(engagementItems.id, active.id) }))?.dmDispatchStatus, "sending");
  await processThemeStudioDmRetries(25, fake);
  assert.equal(calls, 1, "uncertain and sent deliveries must not be retried");
  assert.equal((await db.query.engagementItems.findFirst({ where: eq(engagementItems.id, expired.id) }))?.dmDispatchAttempts, 1);
  console.log("PASS: interrupted and legacy private replies remain uncertain without repeat dispatch");
} catch (error) { console.error(error); failed = true; }
finally {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  process.exit(failed ? 1 : 0);
}
