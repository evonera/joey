import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, user, customAgents, customAgentRuns, scouts, scoutEvaluations, scoutEvaluationEvents, themePages, themeContentFormats, themeVisualTemplates, scoutRemixes, contentPackages, storyClusters, assets, mediaRenderJobs } =
  await import("../../src/lib/db/schema");
const { claimScoutRemix, claimScoutRemixRender, saveScoutRemixDraft, finishScoutRemix, scoutRemixEventKey } = await import("../../src/lib/scouts/remix-receipts");
const { reserveScoutEvaluation, claimScoutEvaluation, markScoutEvaluationPhase, completeScoutEvaluation, failScoutEvaluation, resultFromScoutEvaluation } = await import("../../src/lib/scouts/evaluation-receipts");
const { claimScoutDispatch, releaseScoutDispatch, scoutDispatchBackoff, dispatchScoutsTick, deferScoutEvaluationDispatch } = await import("../../src/lib/scouts/scheduler");
const { eq } = await import("drizzle-orm");
const tenantId = crypto.randomUUID();
const acceptanceUserId = crypto.randomUUID();
try {
  await db.insert(tenants).values({ id: tenantId, name: "Disposable Scout remix acceptance", slug: tenantId });
  await db.insert(user).values({ id: acceptanceUserId, name: "Receipt acceptance", email: `${acceptanceUserId}@example.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
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
  const reservations = await Promise.all(Array.from({ length: 8 }, () => reserveScoutEvaluation(scout, "daily:test")));
  assert.equal(new Set(reservations.map((receipt) => receipt.id)).size, 1, "different callers share one durable evaluation receipt");
  assert.match(reservations[0].operationId, /^[a-f0-9-]{36}$/, "paid operation ID is opaque, not the Scout/tenant/event identifier");
  const evaluationClaims = await Promise.all(reservations.map((receipt) => claimScoutEvaluation(receipt)));
  assert.equal(evaluationClaims.filter((claim) => claim.claimed).length, 1, "concurrent workers have one evaluation lease");
  const evaluationLease = evaluationClaims.find((claim) => claim.claimed)!.receipt;
  const collecting = await markScoutEvaluationPhase(evaluationLease, "collecting");
  const items = [{ id: "post", url: "https://instagram.com/p/source", text: "Verified source" }];
  const collected = await markScoutEvaluationPhase(collecting, "collected", items);
  const alert = { title: "New source", detectedAt: new Date().toISOString(), targetUrl: scout.targetUrl, platform: scout.platform, goal: scout.goalCondition, changes: [{ type: "ADDED" as const, label: "New", after: "Source post", rationale: "Goal met" }], samplePost: { url: items[0].url, content: items[0].text } };
  const evidence = await completeScoutEvaluation(collected, scout, { triggered: true, alert, itemsFound: 1 });
  assert.equal(evidence.triggered, true);
  await assert.rejects(completeScoutEvaluation(collected, scout, { triggered: false, itemsFound: 0 }), /lease expired/, "completed evidence is immutable");
  assert.equal(await failScoutEvaluation(collected, "stale failure"), undefined, "late worker failure cannot overwrite completed evidence");
  const agencyAlias = await reserveScoutEvaluation(scout, "daily:another-agent");
  assert.equal(agencyAlias.id, collected.id, "another agent consumes fresh source evidence, independent of notification suppression");
  await db.update(scoutEvaluations).set({ createdAt: new Date(Date.now() - 24 * 60 * 60_000) }).where(eq(scoutEvaluations.id, collected.id));
  assert.equal((await reserveScoutEvaluation(scout, "daily:another-agent")).id, collected.id, "persisted day alias survives freshness expiration and handoff crash");
  assert.equal(resultFromScoutEvaluation(await reserveScoutEvaluation(scout, "daily:another-agent")).alert?.samplePost?.url, alert.samplePost.url);
  assert.equal((await db.query.scoutEvaluationEvents.findMany({ where: eq(scoutEvaluationEvents.evaluationId, collected.id) })).length, 2);

  const interrupted = await reserveScoutEvaluation(scout, "poll:interrupted");
  const paidClaim = await claimScoutEvaluation(interrupted);
  const paidReceipt = await markScoutEvaluationPhase(paidClaim.receipt, "collecting");
  await db.update(scoutEvaluations).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(scoutEvaluations.id, paidReceipt.id));
  const ambiguous = await claimScoutEvaluation(paidReceipt);
  assert.equal(ambiguous.claimed, false);
  assert.equal(ambiguous.receipt.status, "uncertain", "a crash after paid collection start is never automatically replayed");
  assert.equal((await claimScoutEvaluation(ambiguous.receipt)).claimed, false);

  const safeRecovery = await reserveScoutEvaluation(scout, "poll:safe-recovery");
  const safeClaim = await claimScoutEvaluation(safeRecovery);
  const stored = await markScoutEvaluationPhase(safeClaim.receipt, "collected", items);
  await db.update(scoutEvaluations).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(scoutEvaluations.id, stored.id));
  const resumed = await claimScoutEvaluation(stored);
  assert.equal(resumed.claimed, true, "a saved collection can resume without another provider call");
  assert.equal(resumed.receipt.operationId, stored.operationId);
  assert.deepEqual(resumed.receipt.items, items);
  assert.notEqual(resumed.receipt.leaseToken, stored.leaseToken);
  await assert.rejects(markScoutEvaluationPhase(stored, "judging"), /lease expired/);
  await failScoutEvaluation(resumed.receipt, "Acceptance cleanup");

  const capacitySources = await db.insert(scouts).values(Array.from({ length: 3 }, (_, i) => ({ tenantId, name: `Capacity ${i}`, targetUrl: `https://example.com/capacity${i}/feed`, platform: "rss", goalCondition: "New source", isActive: false }))).returning();
  const capacityReceipts = await Promise.all(capacitySources.map((source) => reserveScoutEvaluation(source, "capacity")));
  const slots = await Promise.all(capacityReceipts.map((receipt) => claimScoutEvaluation(receipt)));
  assert.equal(slots.filter((claim) => claim.claimed).length, 2, "the global DB limit is two across independent dispatchers");
  const occupied = slots.find((claim) => claim.claimed)!.receipt;
  const source = capacitySources.find((entry) => entry.id === occupied.scoutId)!;
  const editedReceipt = await reserveScoutEvaluation({ ...source, goalCondition: "Edited config" }, "edited");
  assert.equal((await claimScoutEvaluation(editedReceipt)).claimed, false, "an edited Scout cannot pay alongside its old config worker");
  const waitingReceipt = slots.find((claim) => !claim.claimed)!.receipt;
  for (let attempt = 0; attempt < 3; attempt++) {
    const handoff = await claimScoutDispatch(waitingReceipt);
    assert.ok(handoff);
    assert.equal((await claimScoutEvaluation(waitingReceipt)).claimed, false);
    const deferredJob = { scoutId: handoff.scoutId, tenantId: handoff.tenantId, evaluationId: handoff.id, dispatchAttempt: handoff.dispatchAttempts, dispatchLeaseUntil: handoff.dispatchLeaseUntil!.toISOString() };
    await deferScoutEvaluationDispatch(deferredJob);
    await deferScoutEvaluationDispatch(deferredJob);
    const deferred = await db.query.scoutEvaluations.findFirst({ where: eq(scoutEvaluations.id, waitingReceipt.id) });
    assert.equal(deferred?.dispatchAttempts, 0, "three successful handoffs deferred for capacity never consume the failure retry budget; duplicate CAS deferral cannot refund twice");
    assert.equal(deferred?.status, "pending");
    await db.update(scoutEvaluations).set({ nextDispatchAt: new Date(Date.now() - 1000) }).where(eq(scoutEvaluations.id, waitingReceipt.id));
  }
  for (const slot of slots) if (slot.claimed) await failScoutEvaluation(slot.receipt, "Acceptance cleanup");
  const [commitRaceSource] = await db.insert(scouts).values({ tenantId, name: "Completion race", targetUrl: "https://instagram.com/commitrace", platform: "instagram", goalCondition: "New source", isActive: true }).returning();
  const commitRaceReceipt = await reserveScoutEvaluation(commitRaceSource, "completion-race");
  const commitRaceClaim = await claimScoutEvaluation(commitRaceReceipt);
  const commitRaceCollected = await markScoutEvaluationPhase(commitRaceClaim.receipt, "collected", items);
  await db.update(scouts).set({ isActive: false, updatedAt: new Date(commitRaceSource.updatedAt.getTime() + 1000) }).where(eq(scouts.id, commitRaceSource.id));
  await assert.rejects(completeScoutEvaluation(commitRaceCollected, commitRaceSource, { triggered: false, itemsFound: 1 }), /before completion/, "an edit/pause after the guard rolls back no-change completion");
  assert.equal((await db.query.scoutEvaluations.findFirst({ where: eq(scoutEvaluations.id, commitRaceReceipt.id) }))?.status, "running", "the completed-evidence write rolled back too");
  assert.equal((await db.query.scouts.findFirst({ where: eq(scouts.id, commitRaceSource.id) }))?.lastPolledAt, null);
  await failScoutEvaluation(commitRaceCollected, "Acceptance cleanup");

  const dispatchSource = capacitySources[2];
  const dispatchReceipt = capacityReceipts[2];
  // Ensure the untouched capacity receipt is available for dispatch assertions.
  await db.update(scoutEvaluations).set({ status: "pending", phase: "preparing", leaseExpiresAt: null }).where(eq(scoutEvaluations.id, dispatchReceipt.id));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const dispatchClaim = await claimScoutDispatch(dispatchReceipt);
    assert.ok(dispatchClaim);
    assert.equal(dispatchClaim.dispatchAttempts, attempt);
    assert.equal(await claimScoutDispatch(dispatchReceipt), undefined, "fresh handoff leases prevent duplicate dispatch");
    await releaseScoutDispatch(dispatchClaim);
    assert.equal(await claimScoutDispatch(dispatchReceipt), undefined, "dispatch failures respect backoff");
    await db.update(scoutEvaluations).set({ nextDispatchAt: new Date(Date.now() - 1000) }).where(eq(scoutEvaluations.id, dispatchReceipt.id));
  }
  assert.equal(await claimScoutDispatch(dispatchReceipt), undefined, "dispatch-only retries are capped at three");
  assert.ok(scoutDispatchBackoff(3) > scoutDispatchBackoff(1));
  await db.update(scouts).set({ isActive: true }).where(eq(scouts.id, dispatchSource.id));
  await dispatchScoutsTick(async () => { throw new Error("fake handoff only; no provider calls"); });
  assert.equal((await db.query.scoutEvaluations.findFirst({ where: eq(scoutEvaluations.id, dispatchReceipt.id) }))?.status, "failed", "exhausted pending handoffs are surfaced instead of silently blocking future intervals");
  await db.update(scouts).set({ isActive: false }).where(eq(scouts.id, dispatchSource.id));
  const dispatchSources = await db.insert(scouts).values(Array.from({ length: 26 }, (_, i) => ({ tenantId, name: `Dispatch page ${i}`, targetUrl: `https://example.com/dispatch${i}/feed`, platform: "rss", goalCondition: "New source", isActive: true }))).returning();
  const handedOff: string[][] = [];
  const firstPage = await dispatchScoutsTick(async (jobs) => { handedOff.push(jobs.map((job) => job.scoutId)); });
  assert.equal(firstPage.dispatchedCount, 25, "cron dispatch is bounded at25");
  const secondPage = await dispatchScoutsTick(async (jobs) => { handedOff.push(jobs.map((job) => job.scoutId)); });
  assert.equal(secondPage.dispatchedCount, 1, "the next tick reaches the26th Scout instead of starving behind leased first-page rows");
  assert.equal(new Set(handedOff.flat()).size, 26);
  for (const source of dispatchSources) await db.update(scouts).set({ isActive: false }).where(eq(scouts.id, source.id));
  const [page] = await db.insert(themePages).values({ tenantId, name: "Test", status: "active" }).returning();
  const [format] = await db
    .insert(themeContentFormats)
    .values({ tenantId, slug: "test", name: "Test", platform: "instagram", mediaType: "image", renderer: "svg" })
    .returning();
  const input = { tenantId, scoutId: scout.id, themePageId: page.id, eventKey: "same-source-post" };
  const sourceAgents = await db.insert(customAgents).values(["Agency A", "Agency B"].map((name) => ({ tenantId, name, createdBy: acceptanceUserId, scoutId: scout.id, themePageId: page.id }))).returning();
  await db.insert(customAgentRuns).values(sourceAgents.map((agent) => ({ tenantId, agentId: agent.id, configVersion: 1, eventKey: "daily:shared-source", status: "completed", leaseToken: crypto.randomUUID(), leaseExpiresAt: new Date(), sourceAlert: alert, sourceEvaluationId: collected.id })));
  assert.equal((await db.query.customAgentRuns.findMany({ where: eq(customAgentRuns.sourceEvaluationId, collected.id) })).length, 2, "two agency runs reference the same immutable completed evidence receipt");
  const firstAgentKey = scoutRemixEventKey(scout.targetUrl, scout.goalCondition, alert, { agentId: sourceAgents[0].id, configVersion: 1 });
  const secondAgentKey = scoutRemixEventKey(scout.targetUrl, scout.goalCondition, alert, { agentId: sourceAgents[1].id, configVersion: 1 });
  const agentDraftClaims = await Promise.all([claimScoutRemix({ ...input, eventKey: firstAgentKey }), claimScoutRemix({ ...input, eventKey: secondAgentKey })]);
  assert.equal(agentDraftClaims.filter((claim) => claim.claimed).length, 2, "two agents consuming shared completed evidence each own an independent draft receipt");
  assert.notEqual(agentDraftClaims[0].receipt.id, agentDraftClaims[1].receipt.id);
  assert.equal((await claimScoutRemix({ ...input, eventKey: firstAgentKey })).claimed, false, "replaying one agent cannot mint another draft");
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
    "Scout acceptance passed: durable evaluation aliases/evidence, atomic global concurrency2, crash/ambiguous-paid fencing, bounded25 dispatch/backoff, atomic draft/cluster, rendering recovery, tenant boundary. No paid providers called."
  );
} finally {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, acceptanceUserId));
}
process.exit(0);
