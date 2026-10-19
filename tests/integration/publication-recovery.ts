import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, drafts, posts, apiKeys } = await import("../../src/lib/db/schema");
const { encrypt } = await import("../../src/lib/crypto");
const { recoverStalePublishingDrafts, publishDueDrafts } = await import("../../src/lib/publisher-core");
const { eq } = await import("drizzle-orm");
const tenantId = crypto.randomUUID();
const foreignTenantId = crypto.randomUUID();
const old = new Date(Date.now() - 600_000);
const publishedAt = new Date("2026-10-18T06:52:39Z");
const responses = new Map<string, { status?: string; metadata?: object; _id?: string; httpStatus?: number; empty?: boolean }>();
const reads: string[] = [];
let creates = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const request = input as Request;
  assert.equal(new URL(request.url).hostname, "zernio.com", "test must never call another provider");
  if (request.method !== "GET") { creates++; throw new Error("Recovery must not publish"); }
  assert.ok(request.signal, "status checks must have a deadline");
  const id = new URL(request.url).pathname.split("/").pop()!;
  reads.push(id);
  const fixture = responses.get(id);
  assert.ok(fixture, `Unexpected provider read: ${id}`);
  await new Promise(resolve => setTimeout(resolve, 30));
  return Response.json(fixture.empty ? {} : fixture.httpStatus ? { error: "fixture-private-provider-error" } : {
    post: { _id: fixture._id ?? id, status: fixture.status, metadata: fixture.metadata, platforms: [{ status: fixture.status, publishedAt: publishedAt.toISOString() }] },
  }, { status: fixture.httpStatus ?? 200 });
};
async function pending(options: { status?: string; receiptStatus?: string; noReceipt?: boolean; noRemoteId?: boolean; publicationCheckedAt?: Date; tenantId?: string } = {}) {
  const id = crypto.randomUUID();
  const owner = options.tenantId ?? tenantId;
  await db.insert(drafts).values({ id, tenantId: owner, content: "Recovery fixture", status: options.status ?? "publishing", createdAt: old, publicationCheckedAt: options.publicationCheckedAt });
  const remoteId = `remote-${id}`;
  if (!options.noReceipt) await db.insert(posts).values({ tenantId: owner, draftId: id, content: "Recovery fixture", zernioPostId: options.noRemoteId ? null : remoteId, status: options.receiptStatus ?? "publishing" });
  responses.set(remoteId, { status: "published", metadata: { draftId: id } });
  return { id, remoteId };
}
const read = (id: string) => db.query.drafts.findFirst({ where: eq(drafts.id, id) });
const recover = (limit = 10) => recoverStalePublishingDrafts({ tenantId, limit });
async function clear() {
  await db.delete(posts).where(eq(posts.tenantId, tenantId));
  await db.delete(drafts).where(eq(drafts.tenantId, tenantId));
  reads.length = 0;
}
let failed = false;
try {
  await db.insert(tenants).values([{ id: tenantId, name: "Recovery fixture", slug: tenantId }, { id: foreignTenantId, name: "Foreign fixture", slug: foreignTenantId }]);
  await db.insert(apiKeys).values({ tenantId, provider: "zernio", encryptedKey: encrypt("fixture-only-key", tenantId), status: "active" });
  const published = await pending();
  assert.deepEqual(await recover(), { recovered: 1, failed: 0 });
  assert.equal((await read(published.id))?.status, "published");
  assert.equal((await db.query.posts.findFirst({ where: eq(posts.draftId, published.id) }))?.publishedAt.toISOString(), publishedAt.toISOString());
  assert.equal((await db.query.posts.findMany({ where: eq(posts.draftId, published.id) })).length, 1);
  await clear();

  const recent = await pending({ publicationCheckedAt: new Date() });
  assert.deepEqual(await recover(), { recovered: 0, failed: 0 });
  assert.equal(reads.length, 0, "recent publication claims must not be interrupted");
  assert.equal((await read(recent.id))?.status, "publishing");
  await clear();

  const slow = await pending();
  responses.set(slow.remoteId, { status: "publishing" });
  assert.deepEqual(await recover(1), { recovered: 0, failed: 0 });
  const next = await pending();
  assert.deepEqual(await recover(1), { recovered: 1, failed: 0 });
  assert.equal((await read(next.id))?.status, "published", "a slow post must not monopolize the batch");
  assert.equal(reads.filter(id => id === slow.remoteId).length, 1, "pending results must back off");
  await clear();

  for (const bad of [{ httpStatus: 503 }, { status: "published", metadata: { draftId: "foreign-draft" } }, { status: "published", _id: "foreign-post" }, { empty: true }, { status: "unknown" }]) {
    const uncertain = await pending();
    const good = await pending();
    responses.set(uncertain.remoteId, bad);
    const result = await publishDueDrafts();
    assert.equal(result.failed, 1, "cron must surface a failed reconciliation");
    assert.equal(result.recovered, 1, "one bad provider response must not block the next post");
    assert.equal((await read(good.id))?.status, "published");
    const saved = await read(uncertain.id);
    assert.equal(saved?.status, "publishing");
    assert.ok(saved?.publicationCheckedAt);
    assert.ok(!saved?.errorMessage?.includes("fixture-private"));
    const before: number = reads.length;
    await recover();
    assert.equal(reads.length, before, "failed status checks must back off");
    await clear();
  }

  const rejected = await pending();
  responses.set(rejected.remoteId, { status: "failed" });
  assert.deepEqual(await recover(), { recovered: 1, failed: 1 });
  assert.equal((await read(rejected.id))?.status, "failed");
  await clear();

  for (const options of [{ noReceipt: true }, { noRemoteId: true }]) {
    const uncertain = await pending(options);
    assert.deepEqual(await recover(), { recovered: 1, failed: 1 });
    assert.ok((await read(uncertain.id))?.errorMessage?.startsWith("verify:"));
    assert.equal(reads.length, 0);
    await clear();
  }

  const terminal = await pending({ receiptStatus: "published" });
  assert.deepEqual(await recover(), { recovered: 1, failed: 0 });
  assert.equal((await read(terminal.id))?.status, "published");
  assert.equal(reads.length, 0, "a verified published receipt must not regress");
  await clear();

  const raced = await pending();
  const foreign = await pending({ tenantId: foreignTenantId });
  const results = await Promise.all([recover(), recover()]);
  assert.equal(results.reduce((total, result) => total + result.recovered, 0), 1);
  assert.deepEqual(reads, [raced.remoteId], "overlapping workers must check once under the draft lock");
  assert.equal((await read(foreign.id))?.status, "publishing", "tenant-scoped recovery must not touch another workspace");
  assert.equal(creates, 0, "all recovery paths must avoid another public post");
  console.log("PASS: provider-confirmed recovery, bounded reads, retry fairness, failure visibility, uncertain outcomes, concurrent workers and tenant isolation; zero create requests");
} catch (error) { console.error(error); failed = true; }
finally {
  globalThis.fetch = originalFetch;
  for (const id of [tenantId, foreignTenantId]) {
    await db.delete(posts).where(eq(posts.tenantId, id));
    await db.delete(tenants).where(eq(tenants.id, id));
  }
}
process.exit(failed ? 1 : 0);
