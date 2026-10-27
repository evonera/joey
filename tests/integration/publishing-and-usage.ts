import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, socialAccounts, drafts, posts, usageTracking, usageReservations, agentUsageEvents, webhookEvents, flows, flowRuns } = await import("../../src/lib/db/schema");
const { eq, sql } = await import("drizzle-orm");
const { executePublishDraft } = await import("../../src/lib/publisher-core");
const { reviewDraft } = await import("../../src/lib/draft-review");
const { failPackage, packagePublicationSnapshot, publishContentPackage } = await import("../../src/lib/theme-studio/publishing/publisher");
const { lockedThemePreview } = await import("../../src/lib/theme-studio/publishing/locked-preview");
const { themePages, themeContentFormats, contentPackages, storyClusters } = await import("../../src/lib/db/schema");
const { recordAgentUsage } = await import("../../src/lib/agent-usage");
const { releaseUsageReservation, reserveUsageBudget, UsageBudgetExceededError } = await import("../../src/lib/usage");
const { storeWebhookEvent } = await import("../../src/lib/webhooks");
const { processZernioWebhookEvent, recoverZernioWebhookEvents } = await import("../../src/lib/zernio-webhook-processing");
const tenantId = crypto.randomUUID();
let failed = false;
try {
  await db.insert(tenants).values({ id: tenantId, name: "Integration test", slug: tenantId, createdAt: new Date() });
  const [themePage] = await db.insert(themePages).values({ tenantId, name: "Test theme" }).returning();
  const [themeFormat] = await db.insert(themeContentFormats).values({ tenantId, name: "Test", slug: "test", platform: "x", mediaType: "image", renderer: "puppeteer" }).returning();
  const [themePackage] = await db.insert(contentPackages).values({ tenantId, themePageId: themePage.id, formatId: themeFormat.id, title: "Original", status: "approved" }).returning();
  const [claimFixture] = await db.insert(contentPackages).values({ tenantId, themePageId: themePage.id, formatId: themeFormat.id, title: "Claim", status: "approved" }).returning();
  await db.execute(sql`UPDATE content_packages SET scheduled_for = '2030-01-01 00:00:00.123456'::timestamp WHERE id = ${claimFixture.id}`);
  const scheduledClaimFixture = await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, claimFixture.id) });
  assert.ok(scheduledClaimFixture);
  const { and } = await import("drizzle-orm");
  await db.update(contentPackages).set({ caption: "Changed without a timestamp update" }).where(eq(contentPackages.id, claimFixture.id));
  const staleClaim = await db.update(contentPackages).set({ status: "publishing" }).where(and(eq(contentPackages.id, claimFixture.id), packagePublicationSnapshot(scheduledClaimFixture))).returning();
  assert.equal(staleClaim.length, 0, "a same-timestamp edit must invalidate the publication claim");
  const [cluster] = await db.insert(storyClusters).values({ tenantId, themePageId: themePage.id, title: "Changed evidence" }).returning();
  const beforeClusterChange = await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, claimFixture.id) });
  assert.ok(beforeClusterChange);
  await db.update(contentPackages).set({ clusterId: cluster.id }).where(eq(contentPackages.id, claimFixture.id));
  const staleEvidenceClaim = await db.update(contentPackages).set({ status: "publishing" }).where(and(eq(contentPackages.id, claimFixture.id), packagePublicationSnapshot(beforeClusterChange))).returning();
  assert.equal(staleEvidenceClaim.length, 0, "a changed evidence cluster must invalidate the publication claim");
  await failPackage(claimFixture.id, tenantId, "Stale evidence failure", beforeClusterChange);
  assert.equal((await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, claimFixture.id) }))?.status, "approved", "a stale failure must not overwrite an evidence change");
  const currentClaim = await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, claimFixture.id) });
  assert.ok(currentClaim);
  const freshClaim = await db.update(contentPackages).set({ status: "publishing" }).where(and(eq(contentPackages.id, claimFixture.id), packagePublicationSnapshot(currentClaim))).returning();
  assert.equal(freshClaim.length, 1, "an unchanged database timestamp with microseconds must allow the claim");
  await db.update(contentPackages).set({ status: "publishing", metrics: { publishAttemptAt: new Date().toISOString() } }).where(eq(contentPackages.id, themePackage.id));
  await failPackage(themePackage.id, tenantId, "Stale failure", themePackage);
  assert.equal((await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, themePackage.id) }))?.status, "publishing", "an outdated validation failure must not overwrite a claimed package");
  const [editablePackage] = await db.insert(contentPackages).values({ tenantId, themePageId: themePage.id, formatId: themeFormat.id, title: "Original", status: "approved" }).returning();
  await db.update(contentPackages).set({ title: "Repaired" }).where(eq(contentPackages.id, editablePackage.id));
  await failPackage(editablePackage.id, tenantId, "Stale failure", editablePackage);
  assert.equal((await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, editablePackage.id) }))?.status, "approved", "an edited package must not be marked failed by an old read");
  const repaired = await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, editablePackage.id) });
  assert.ok(repaired);
  assert.equal((await failPackage(editablePackage.id, tenantId, "Current failure", repaired)).error, "Current failure");
  assert.equal((await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, editablePackage.id) }))?.status, "failed");
  const [account] = await db.insert(socialAccounts).values({ tenantId, platform: "twitter", platformAccountId: "remote-account", accountName: "Test", isActive: true }).returning();
  await db.update(themePages).set({ connectedAccounts: [account.id] }).where(eq(themePages.id, themePage.id));
  const [previewPackage] = await db.insert(contentPackages).values({ tenantId, themePageId: themePage.id, formatId: themeFormat.id, title: "Preview", caption: "Confirmed content", status: "approved", renderedAssetUrls: [{ url: "https://example.com/image.png", type: "image" }] }).returning();
  const prepare = () => db.transaction(tx => lockedThemePreview(tx, tenantId, previewPackage.id, true));
  const firstPreview = await prepare();
  assert.equal(firstPreview.payload.content, "Confirmed content");
  assert.equal(firstPreview.identity[0].id, account.id);
  assert.equal((await prepare()).fingerprint, firstPreview.fingerprint);
  await db.update(socialAccounts).set({ accountName: "Changed" }).where(eq(socialAccounts.id, account.id));
  assert.notEqual((await prepare()).fingerprint, firstPreview.fingerprint, "account changes invalidate a preview");
  await db.update(socialAccounts).set({ accountName: account.accountName }).where(eq(socialAccounts.id, account.id));
  await db.update(themePages).set({ name: "Changed theme" }).where(eq(themePages.id, themePage.id));
  assert.notEqual((await prepare()).fingerprint, firstPreview.fingerprint, "theme changes invalidate a preview");
  await db.update(themePages).set({ name: themePage.name }).where(eq(themePages.id, themePage.id));
  await db.update(themeContentFormats).set({ aspectRatio: "4:5" }).where(eq(themeContentFormats.id, themeFormat.id));
  assert.notEqual((await prepare()).fingerprint, firstPreview.fingerprint, "format changes invalidate a preview");
  await db.update(themeContentFormats).set({ aspectRatio: themeFormat.aspectRatio }).where(eq(themeContentFormats.id, themeFormat.id));
  await db.update(socialAccounts).set({ isActive: false }).where(eq(socialAccounts.id, account.id));
  await assert.rejects(prepare(), /active account/, "a disconnected destination must not remain eligible");
  await db.update(socialAccounts).set({ isActive: true }).where(eq(socialAccounts.id, account.id));
  let releaseWriter!: () => void;
  let writerLocked!: () => void;
  const locked = new Promise<void>(resolve => { writerLocked = resolve; });
  const release = new Promise<void>(resolve => { releaseWriter = resolve; });
  const writer = db.transaction(async tx => {
    await tx.update(themePages).set({ name: "Concurrent change" }).where(eq(themePages.id, themePage.id));
    writerLocked();
    await release;
  });
  await locked;
  const concurrentPreview = prepare();
  await new Promise(resolve => setTimeout(resolve, 50));
  releaseWriter();
  await writer;
  assert.notEqual((await concurrentPreview).fingerprint, firstPreview.fingerprint, "preview must observe a concurrent committed theme update");
  await db.update(themePages).set({ name: themePage.name }).where(eq(themePages.id, themePage.id));
  await db.update(contentPackages).set({ caption: "Changed content" }).where(eq(contentPackages.id, previewPackage.id));
  assert.notEqual((await prepare()).fingerprint, firstPreview.fingerprint, "content changes invalidate a preview");
  assert.equal((await publishContentPackage(previewPackage.id, tenantId, true, firstPreview.fingerprint)).success, false);
  assert.equal((await db.query.contentPackages.findFirst({ where: eq(contentPackages.id, previewPackage.id) }))?.status, "approved", "stale confirmation must not claim or send the package");
  const reviewed = await prepare();
  let submitted = 0;
  const themeProvider = { posts: { createPost: async (request: any) => { submitted++; assert.deepEqual(request.body, reviewed.payload); return { data: { post: { _id: "confirmed-theme-post", status: "published" } } }; } } };
  const themeResult = await publishContentPackage(previewPackage.id, tenantId, true, reviewed.fingerprint, themeProvider as any);
  assert.equal(themeResult.status, "published");
  assert.equal(submitted, 1, "the exact confirmed payload is sent once");
  async function draft(status = "approved", options: Record<string, unknown> = {}) {
    const [row] = await db.insert(drafts).values({ tenantId, status, content: "Integration test post", platformOptions: { platform: "x", accountId: account.id }, ...options }).returning();
    return row;
  }
  let calls = 0;
  let remoteStatus = "publishing";
  const fake = { posts: {
    createPost: async (request: any) => { calls++; await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(request.body.publishNow, true); assert.equal(request.body.platforms[0].accountId, "remote-account"); return { data: { post: { _id: `remote-${calls}`, status: remoteStatus } } }; },
    getPost: async () => ({ data: { post: { _id: "remote-1", status: remoteStatus } } }),
  } };
  const asyncDraft = await draft();
  const initial = await executePublishDraft(asyncDraft.id, tenantId, fake as any);
  assert.equal(initial.status, "publishing");
  assert.equal((await db.query.drafts.findFirst({ where: eq(drafts.id, asyncDraft.id) }))?.status, "publishing");
  remoteStatus = "published";
  await executePublishDraft(asyncDraft.id, tenantId, fake as any);
  assert.equal(calls, 1, "reconciliation must not submit another remote post");
  assert.equal((await db.query.drafts.findFirst({ where: eq(drafts.id, asyncDraft.id) }))?.status, "published");
  const scheduled = await draft("scheduled", { scheduledFor: new Date(Date.now() - 1000) });
  assert.equal((await executePublishDraft(scheduled.id, tenantId, fake as any)).status, "published");
  const future = await draft("scheduled", { scheduledFor: new Date(Date.now() + 60000) });
  const before = calls;
  assert.ok((await executePublishDraft(future.id, tenantId, fake as any)).error);
  assert.equal(calls, before, "future scheduled posts must not publish early");
  const explicitlyEarly = await draft("scheduled", { scheduledFor: new Date(Date.now() + 60000) });
  assert.equal((await executePublishDraft(explicitlyEarly.id, tenantId, fake as any, true)).status, "published");
  const concurrent = await draft();
  const results = await Promise.all([executePublishDraft(concurrent.id, tenantId, fake as any), executePublishDraft(concurrent.id, tenantId, fake as any)]);
  assert.equal(results.filter(result => result.success).length, 1);
  assert.equal(calls, before + 2, "concurrent requests must claim once");

  const confirmedDraft = await draft();
  const confirmation = { content: confirmedDraft.content, platformOptions: confirmedDraft.platformOptions, status: confirmedDraft.status, scheduledFor: null, account: { id: account.id, accountName: account.accountName, platform: account.platform, platformAccountId: account.platformAccountId } };
  let confirmationCalls = 0;
  const confirmedProvider = { posts: { createPost: async (request: any) => {
    confirmationCalls++;
    assert.equal(request.body.content, confirmedDraft.content);
    assert.equal(request.body.platforms[0].accountId, account.platformAccountId);
    return { data: { post: { _id: "confirmed-post", status: "published" } } };
  } } };
  await db.update(drafts).set({ content: "Changed after preview" }).where(eq(drafts.id, confirmedDraft.id));
  assert.ok((await executePublishDraft(confirmedDraft.id, tenantId, confirmedProvider as any, false, confirmation)).error);
  assert.equal(confirmationCalls, 0, "changed content must not be sent");
  await db.update(drafts).set({ content: confirmedDraft.content }).where(eq(drafts.id, confirmedDraft.id));
  await db.update(drafts).set({ platformOptions: { platform: "x", accountId: account.id, mediaUrls: ["https://example.com/changed.png"] } }).where(eq(drafts.id, confirmedDraft.id));
  assert.ok((await executePublishDraft(confirmedDraft.id, tenantId, confirmedProvider as any, false, confirmation)).error);
  await db.update(drafts).set({ platformOptions: confirmedDraft.platformOptions, scheduledFor: new Date(Date.now() + 60_000) }).where(eq(drafts.id, confirmedDraft.id));
  assert.ok((await executePublishDraft(confirmedDraft.id, tenantId, confirmedProvider as any, false, confirmation)).error);
  await db.update(drafts).set({ scheduledFor: null }).where(eq(drafts.id, confirmedDraft.id));
  await db.update(socialAccounts).set({ accountName: "Changed name" }).where(eq(socialAccounts.id, account.id));
  assert.ok((await executePublishDraft(confirmedDraft.id, tenantId, confirmedProvider as any, false, confirmation)).error);
  assert.equal(confirmationCalls, 0, "changed account identity must not be sent");
  await db.update(socialAccounts).set({ accountName: account.accountName }).where(eq(socialAccounts.id, account.id));
  assert.equal((await executePublishDraft(confirmedDraft.id, tenantId, confirmedProvider as any, false, confirmation)).status, "published");
  assert.equal(confirmationCalls, 1);
  const invalid = await draft();
  const rejected = await executePublishDraft(invalid.id, tenantId, { posts: { createPost: async () => ({ error: { error: "Bad media" }, response: { status: 400 } }) } } as any);
  assert.ok(rejected.error);
  assert.equal((await db.query.posts.findMany({ where: eq(posts.draftId, invalid.id) })).length, 0);
  const lostReceipt = await draft();
  await db.execute(sql`ALTER TABLE posts ADD CONSTRAINT audit_reject_receipt CHECK (zernio_post_id IS DISTINCT FROM 'accepted-before-db-failure')`);
  try {
    const failReceipt = { posts: { createPost: async () => ({ data: { post: { _id: "accepted-before-db-failure", status: "published" } } }) } };
    const failedReceipt = await executePublishDraft(lostReceipt.id, tenantId, failReceipt as any);
    assert.match(failedReceipt.error || "", /^verify:/);
  } finally { await db.execute(sql`ALTER TABLE posts DROP CONSTRAINT audit_reject_receipt`); }
  assert.match((await db.query.drafts.findFirst({ where: eq(drafts.id, lostReceipt.id) }))?.errorMessage || "", /^verify:/);
  assert.ok((await executePublishDraft(lostReceipt.id, tenantId, fake as any)).error, "a lost receipt must never be submitted again");

  const uncertain = await draft("failed", { errorMessage: "verify: Check Zernio first" });
  assert.ok((await executePublishDraft(uncertain.id, tenantId, fake as any)).error);
  for (const decision of ["approve", "reject"] as const) {
    const result = await reviewDraft({ tenantId, draftId: uncertain.id, decision });
    assert.ok(result.error, `${decision} must not clear an uncertain publication`);
    const unchanged = await db.query.drafts.findFirst({ where: eq(drafts.id, uncertain.id) });
    assert.equal(unchanged?.status, "failed");
    assert.equal(unchanged?.errorMessage, "verify: Check Zernio first");
  }
  const reviewable = await draft("pending_review");
  assert.equal((await reviewDraft({ tenantId, draftId: reviewable.id, decision: "approve" })).success, true);
  assert.ok((await reviewDraft({ tenantId, draftId: asyncDraft.id, decision: "reject" })).error, "a published draft must not be reset by review");
  const withReceipt = await draft("failed");
  await db.insert(posts).values({ tenantId, draftId: withReceipt.id, content: "Already submitted", status: "published" });
  for (const decision of ["approve", "reject"] as const) {
    assert.ok((await reviewDraft({ tenantId, draftId: withReceipt.id, decision })).error, "a receipt must fence review even if the draft has a reviewable status");
  }
  assert.equal((await db.query.drafts.findFirst({ where: eq(drafts.id, withReceipt.id) }))?.status, "failed");
  const ordinaryFailure = await draft("failed", { errorMessage: "Provider rejected the post" });
  assert.equal((await reviewDraft({ tenantId, draftId: ordinaryFailure.id, decision: "approve" })).success, true);
  assert.equal(calls, before + 2);

  const mediaOnly = await draft("pending_review", { content: "", variants: [{ name: "old", content: "Discarded text" }], platformOptions: { platform: "x", accountId: account.id, mediaUrls: ["https://example.com/image.png"] } });
  assert.equal((await reviewDraft({ tenantId, draftId: mediaOnly.id, decision: "approve" })).success, true);
  const mediaPublish = await executePublishDraft(mediaOnly.id, tenantId, { posts: { createPost: async (request: any) => {
    assert.equal(request.body.content, "");
    assert.deepEqual(request.body.mediaItems, [{ type: "image", url: "https://example.com/image.png" }]);
    return { data: { post: { _id: "media-only-post", status: "published" } } };
  } } } as any);
  assert.equal(mediaPublish.status, "published");

  for (const canonicalStatus of ["published", "failed"]) {
    const raced = await draft();
    const result = await executePublishDraft(raced.id, tenantId, { posts: { createPost: async () => {
      // Simulate a verified webhook arriving before the original HTTP response.
      await db.update(drafts).set({ status: canonicalStatus, errorMessage: canonicalStatus === "failed" ? "Remote failure" : null }).where(eq(drafts.id, raced.id));
      return { data: { post: { _id: `raced-${canonicalStatus}`, status: "publishing" } } };
    } } } as any);
    assert.equal((await db.query.drafts.findFirst({ where: eq(drafts.id, raced.id) }))?.status, canonicalStatus);
    assert.equal((await db.query.posts.findFirst({ where: eq(posts.draftId, raced.id) }))?.status, canonicalStatus);
    if (canonicalStatus === "published") assert.equal(result.status, "published");
    else assert.ok(result.error);
  }

  const measured = { tenantId, eventId: crypto.randomUUID(), inputTokens: 100, outputTokens: 50, costUsd: 0.00000012 };
  await Promise.all([recordAgentUsage(measured), recordAgentUsage(measured)]);
  const usage = await db.query.usageTracking.findFirst({ where: eq(usageTracking.tenantId, tenantId) });
  assert.equal(usage?.inputTokensUsed, 100);
  assert.equal(usage?.outputTokensUsed, 50);
  assert.equal(Number(usage?.estimatedCostUsd), 0.00000012, "small costs must not round to zero");
  assert.equal((await db.query.agentUsageEvents.findMany({ where: eq(agentUsageEvents.tenantId, tenantId) })).length, 1);

  await db.update(usageTracking).set({ budgetLimitUsd: "0.0010", estimatedCostUsd: "0", reservedCostUsd: "0" }).where(eq(usageTracking.tenantId, tenantId));
  const admissions = await Promise.allSettled([
    reserveUsageBudget({ tenantId, kind: "text", modelId: "gpt-5.6-luna", estimatedCostUsd: 0.00075 }),
    reserveUsageBudget({ tenantId, kind: "text", modelId: "gpt-5.6-luna", estimatedCostUsd: 0.00075 }),
  ]);
  assert.equal(admissions.filter((result) => result.status === "fulfilled").length, 1, "row locking must prevent concurrent reservations from oversubscribing the budget");
  const rejectedAdmission = admissions.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.ok(rejectedAdmission.reason instanceof UsageBudgetExceededError);
  const acceptedAdmission = (admissions.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<typeof usageReservations.$inferSelect>).value;
  await releaseUsageReservation(acceptedAdmission.id, { integrationCleanup: true });
  assert.equal(Number((await db.query.usageTracking.findFirst({ where: eq(usageTracking.tenantId, tenantId) }))?.reservedCostUsd), 0);

  const payload = { id: crypto.randomUUID(), event: "post.updated", timestamp: new Date().toISOString(), account: { id: account.platformAccountId } };
  const stored = await storeWebhookEvent(payload);
  assert.ok(stored.event);
  await processZernioWebhookEvent(payload, stored.event.createdAt);
  assert.equal((await db.query.webhookEvents.findFirst({ where: eq(webhookEvents.eventId, payload.id) }))?.status, "processed", "timestamp fence must round-trip through PostgreSQL");
  const retryPayload = { ...payload, id: crypto.randomUUID() };
  await db.insert(webhookEvents).values({ tenantId, eventId: retryPayload.id, eventType: retryPayload.event, payload: retryPayload, status: "processing", attemptCount: 1, updatedAt: new Date(Date.now() - 600_000) });
  const exhaustedPayload = { ...payload, id: crypto.randomUUID() };
  await db.insert(webhookEvents).values({ tenantId, eventId: exhaustedPayload.id, eventType: exhaustedPayload.event, payload: exhaustedPayload, status: "failed", attemptCount: 8, updatedAt: new Date(Date.now() - 7_200_000) });
  await Promise.all([recoverZernioWebhookEvents(20), recoverZernioWebhookEvents(20)]);
  const recovered = await db.query.webhookEvents.findFirst({ where: eq(webhookEvents.eventId, retryPayload.id) });
  assert.equal(recovered?.status, "processed");
  assert.equal(recovered?.attemptCount, 2, "overlapping recovery workers must process the event only once");
  assert.equal((await db.query.webhookEvents.findFirst({ where: eq(webhookEvents.eventId, exhaustedPayload.id) }))?.status, "failed");
  const { createDraftNode } = await import("../../src/lib/flows/nodes/actions/create-draft");
  const { executeFlow } = await import("../../src/lib/flows/executor");
  const { officialTemplates } = await import("../../src/lib/flows/templates");
  const { nodeRegistry } = await import("../../src/lib/flows/registry");
  const [instagram] = await db.insert(socialAccounts).values({ tenantId, platform: "instagram", platformAccountId: "remote-instagram", accountName: "Instagram test", isActive: true }).returning();
  const [tiktok] = await db.insert(socialAccounts).values({ tenantId, platform: "tiktok", platformAccountId: "remote-tiktok", accountName: "TikTok test", isActive: true }).returning();
  const [flow] = await db.insert(flows).values({ tenantId, name: "Template integration", graph: { nodes: [], edges: [] } }).returning();
  const [run] = await db.insert(flowRuns).values({ tenantId, flowId: flow.id }).returning();
  const context = { tenantId, flowId: flow.id, runId: run.id, nodeId: "media-array" };
  const urls = ["https://example.com/one.png", "https://example.com/two.png"];
  const created = await createDraftNode.execute({ caption: "An Instagram carousel", mediaUrls: urls }, { platform: "instagram", mediaUrlField: "mediaUrls" }, context);
  const resultId = (created.output as { draftId: string }).draftId;
  const saved = await db.query.drafts.findFirst({ where: eq(drafts.id, resultId) });
  assert.deepEqual((saved?.platformOptions as any).mediaUrls, urls, "multiple media URLs must remain separate attachments");
  assert.equal((saved?.platformOptions as any).accountId, instagram.id, "an unambiguous connected account must be pinned at draft creation");
  const replayedDraft = await createDraftNode.execute({ caption: "An Instagram carousel", mediaUrls: urls }, { platform: "instagram", mediaUrlField: "mediaUrls" }, context);
  assert.equal((replayedDraft.output as { draftId: string }).draftId, resultId, "replaying the same flow node must return the existing draft");
  await assert.rejects(createDraftNode.execute({ caption: "Wrong account", mediaUrls: urls }, { platform: "instagram", accountId: account.id }, { ...context, nodeId: "wrong-account" }), /active account/);
  await assert.rejects(createDraftNode.execute({ caption: "Unsafe URL", mediaUrls: ["file:\/\/\/tmp\/secret.png"] }, { platform: "instagram" }, { ...context, nodeId: "invalid-url" }));

  // Exercise real fan-in and persistence, replacing only the paid provider nodes.
  const originalLlm = nodeRegistry["ai.llm"].execute;
  const originalImage = nodeRegistry["ai.image"].execute;
  try {
    nodeRegistry["ai.llm"].execute = async () => ({ output: { caption: "An original caption", imagePrompt: "The phases of the Moon" } });
    nodeRegistry["ai.image"].execute = async () => ({ output: { imageUrl: "https://example.com/generated.png" } });
    for (const slug of ["instagram-theme-image", "tiktok-video-caption"]) {
      const template = officialTemplates.find(t => t.slug === slug)!;
      const [templateRun] = await db.insert(flowRuns).values({ tenantId, flowId: flow.id }).returning();
      const execution = await executeFlow(template.graph, { tenantId, flowId: flow.id, runId: templateRun.id });
      assert.equal(execution.status, "succeeded", JSON.stringify(execution.steps));
      const output = execution.outputs.d1 as { draftId: string };
      const persisted = await db.query.drafts.findFirst({ where: eq(drafts.id, output.draftId) });
      assert.equal(persisted?.status, "pending_review");
      assert.equal(persisted?.content, "An original caption");
      assert.deepEqual((persisted?.platformOptions as any).mediaUrls, slug.startsWith("instagram") ? ["https://example.com/generated.png"] : ["https://example.com/replace-with-your-video.mp4"]);
      assert.equal((persisted?.platformOptions as any).accountId, slug.startsWith("instagram") ? instagram.id : tiktok.id);
    }
  } finally {
    nodeRegistry["ai.llm"].execute = originalLlm;
    nodeRegistry["ai.image"].execute = originalImage;
  }
  const { verifyUsageAccountingConcurrency } = await import("./usage-accounting");
  await verifyUsageAccountingConcurrency();
  console.log("PASS: publication intent, reconciliation races, concurrent claims, duplicate prevention, usage precision, webhook timestamp fencing and bounded concurrent recovery, draft account/media validation and Instagram/TikTok template execution");
} catch (error) { console.error(error); failed = true; }
finally { await db.delete(webhookEvents).where(eq(webhookEvents.tenantId, tenantId)); await db.delete(tenants).where(eq(tenants.id, tenantId)); }
process.exit(failed ? 1 : 0);
