import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, scouts, themePages, themeContentFormats, themeVisualTemplates, scoutRemixes, contentPackages, storyClusters, assets, mediaRenderJobs } =
  await import("../../src/lib/db/schema");
const { claimScoutRemix, claimScoutRemixRender, saveScoutRemixDraft, finishScoutRemix } = await import("../../src/lib/scouts/remix-receipts");
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
  const renderClaims = await Promise.all(Array.from({ length: 8 }, () => claimScoutRemixRender({ ...receipt, packageId: saved.pkg.id })));
  assert.equal(renderClaims.filter(Boolean).length, 1, "render recovery has one lease owner too");
  const renderReceipt = renderClaims.find(Boolean)!;
  await finishScoutRemix(receipt, "failed", "stale draft worker");
  assert.equal((await db.query.scoutRemixes.findFirst({ where: eq(scoutRemixes.id, receipt.id) }))?.status, "rendering");
  await finishScoutRemix(renderReceipt, "queued");
  assert.equal(await claimScoutRemixRender(renderReceipt), undefined, "a fresh queued lease must not dispatch twice");
  await db.update(scoutRemixes).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(scoutRemixes.id, receipt.id));
  const queuedRecovery = await claimScoutRemixRender(renderReceipt);
  assert.ok(queuedRecovery, "an expired queued receipt must be reclaimable");
  await finishScoutRemix(queuedRecovery, "queued");
  await db.update(contentPackages).set({ status: "rejected" }).where(eq(contentPackages.id, saved.pkg.id));
  await db.update(scoutRemixes).set({ status: "failed" }).where(eq(scoutRemixes.id, receipt.id));
  assert.equal(await claimScoutRemixRender(queuedRecovery), undefined, "rejection blocks render recovery at the database claim");
  await db.update(contentPackages).set({ status: "pending_review" }).where(eq(contentPackages.id, saved.pkg.id));
  const duplicate = await claimScoutRemix(input);
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.receipt.packageId, saved.pkg.id);
  assert.equal((await db.query.contentPackages.findMany({ where: eq(contentPackages.tenantId, tenantId) })).length, 1);
  // Exercise the real async adapter without Modal/R2 calls: fake only the
  // provider completion, not queue identity, retry bounds, or SQL attachment.
  process.env.MEDIA_ENGINE_ENABLED = "true";
  delete process.env.MEDIA_WORKER_DISPATCH_URL;
  const { queueThemeRender, settleThemeRender } = await import("../../src/lib/media-engine/theme-adapter");
  const [sourceAsset] = await db.insert(assets).values({ tenantId, filename: "input.png", key: `${tenantId}/input.png`, mimeType: "image/png", size: 100, publicUrl: `https://assets.example.com/${tenantId}/input.png` }).returning();
  const [template] = await db.insert(themeVisualTemplates).values({ tenantId, themePageId: page.id, formatId: format.id, name: "Test", renderer: "svg", componentSpec: { mediaAssetId: sourceAsset.id } }).returning();
  await db.update(contentPackages).set({ templateId: template.id }).where(eq(contentPackages.id, saved.pkg.id));
  const job = await queueThemeRender(tenantId, saved.pkg.id, undefined, { preserveReviewDecision: true });
  await db.update(mediaRenderJobs).set({ status: "failed", attempt: 1, error: "Test failure" }).where(eq(mediaRenderJobs.id, job.jobId));
  await db.update(scoutRemixes).set({ status: "queued" }).where(eq(scoutRemixes.id, receipt.id));
  await settleThemeRender(tenantId, saved.pkg.id);
  assert.equal((await db.query.scoutRemixes.findFirst({ where: eq(scoutRemixes.id, receipt.id) }))?.status, "failed");
  const retry = await queueThemeRender(tenantId, saved.pkg.id, undefined, { preserveReviewDecision: true });
  assert.equal(retry.jobId, job.jobId, "recovery retains the identical render job");
  assert.equal(retry.status, "queued");
  assert.equal((await db.query.mediaRenderJobs.findMany({ where: eq(mediaRenderJobs.tenantId, tenantId) })).length, 1);
  await db.update(contentPackages).set({ status: "rejected" }).where(eq(contentPackages.id, saved.pkg.id));
  await assert.rejects(queueThemeRender(tenantId, saved.pkg.id, undefined, { preserveReviewDecision: true }), /rejected/);
  await db.update(mediaRenderJobs).set({ status: "succeeded", outputAssetId: sourceAsset.id }).where(eq(mediaRenderJobs.id, job.jobId));
  await settleThemeRender(tenantId, saved.pkg.id);
  assert.equal((await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, saved.pkg.id) }))?.status, "rejected", "late completion preserves rejection");
  await db.update(contentPackages).set({ status: "pending_review" }).where(eq(contentPackages.id, saved.pkg.id));
  await db.update(scoutRemixes).set({ status: "queued" }).where(eq(scoutRemixes.id, receipt.id));
  await settleThemeRender(tenantId, saved.pkg.id);
  assert.equal((await db.query.scoutRemixes.findFirst({ where: eq(scoutRemixes.id, receipt.id) }))?.status, "complete");
  await finishScoutRemix(queuedRecovery, "queued");
  assert.equal((await db.query.scoutRemixes.findFirst({ where: eq(scoutRemixes.id, receipt.id) }))?.status, "complete", "late dispatch cannot overwrite terminal settlement");
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
