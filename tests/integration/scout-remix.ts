import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, scouts, themePages, themeContentFormats, scoutRemixes, contentPackages, storyClusters } =
  await import("../../src/lib/db/schema");
const { claimScoutRemix, saveScoutRemixDraft, finishScoutRemix } = await import("../../src/lib/scouts/remix-receipts");
const { eq } = await import("drizzle-orm");
const tenantId = crypto.randomUUID();
try {
  await db.insert(tenants).values({ id: tenantId, name: "Disposable Scout remix acceptance", slug: tenantId });
  const [scout] = await db
    .insert(scouts)
    .values({
      tenantId,
      name: "Test",
      platform: "instagram",
      targetUrl: "https://instagram.com/test",
      goalCondition: "New story",
      isActive: false,
    })
    .returning();
  const [page] = await db.insert(themePages).values({ tenantId, name: "Test", status: "active" }).returning();
  const [format] = await db
    .insert(themeContentFormats)
    .values({ tenantId, slug: "test", name: "Test", platform: "instagram", mediaType: "image", renderer: "svg" })
    .returning();
  const input = { tenantId, scoutId: scout.id, themePageId: page.id, eventKey: "same-source-post" };
  const claims = await Promise.all(Array.from({ length: 8 }, () => claimScoutRemix(input)));
  assert.equal(
    claims.filter((claim) => claim.claimed).length,
    1,
    "eight simultaneous scans must claim a source event once"
  );
  const receipt = claims.find((claim) => claim.claimed)!.receipt;
  const cluster = { tenantId, themePageId: page.id, title: "Supported story", facts: [], memberItemIds: [] };
  const pkg = {
    tenantId,
    themePageId: page.id,
    formatId: format.id,
    title: "Original draft",
    status: "pending_review",
  };
  await assert.rejects(saveScoutRemixDraft({ ...receipt, leaseToken: "stale" }, cluster, pkg), /lease expired/);
  assert.equal((await db.query.storyClusters.findMany({ where: eq(storyClusters.tenantId, tenantId) })).length, 0);
  const saved = await saveScoutRemixDraft(receipt, cluster, pkg);
  await assert.rejects(
    saveScoutRemixDraft(receipt, cluster, pkg),
    /lease expired/,
    "a replay cannot create a second draft"
  );
  await finishScoutRemix(receipt, "queued");
  const duplicate = await claimScoutRemix(input);
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.receipt.packageId, saved.pkg.id);
  assert.equal((await db.query.contentPackages.findMany({ where: eq(contentPackages.tenantId, tenantId) })).length, 1);
  const crashInput = { ...input, eventKey: "interrupted-event" };
  const initial = await claimScoutRemix(crashInput);
  await db
    .update(scoutRemixes)
    .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
    .where(eq(scoutRemixes.id, initial.receipt.id));
  const recovered = await claimScoutRemix(crashInput);
  assert.equal(recovered.claimed, true);
  assert.notEqual(recovered.receipt.leaseToken, initial.receipt.leaseToken);
  await finishScoutRemix(initial.receipt, "failed", "late stale failure");
  assert.equal(
    (await db.query.scoutRemixes.findFirst({ where: eq(scoutRemixes.id, recovered.receipt.id) }))?.status,
    "processing"
  );
  await assert.rejects(
    saveScoutRemixDraft(recovered.receipt, { ...cluster, tenantId: "foreign" }, pkg),
    /ownership mismatch/
  );
  console.log(
    "Scout remix acceptance passed: concurrent dedupe, atomic draft/cluster, stale lease fencing, interrupted-run recovery, tenant boundary. No paid providers called."
  );
} finally {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}
process.exit(0);
