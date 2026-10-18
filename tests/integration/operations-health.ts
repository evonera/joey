import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, scouts, scoutEvaluations, mediaRenderJobs, drafts, posts, themePages, themeContentFormats, contentPackages } = await import("../../src/lib/db/schema");
const { getOperationalHealth } = await import("../../src/lib/operations");
const { scoutConfigurationKey } = await import("../../src/lib/scouts/evaluation-receipts");
const { eq, inArray } = await import("drizzle-orm");
const tenantId = crypto.randomUUID();
const foreignId = crypto.randomUUID();
const now = new Date("2026-10-19T12:00:00Z");
const recent = new Date(now.getTime() - 60_000);
const old = new Date(now.getTime() - 2 * 86_400_000);
const hourAgo = new Date(now.getTime() - 60 * 60_000);
const tomorrow = new Date(now.getTime() + 86_400_000);
let failed = false;
try {
  await db.insert(tenants).values([tenantId, foreignId].map(id => ({ id, name: "Disposable operational health acceptance" })));
  const [scout, foreignScout] = await db.insert(scouts).values([tenantId, foreignId].map(id => ({ tenantId: id, name: "Overdue fixture", targetUrl: "https://example.com/feed", platform: "rss", goalCondition: "views > 100", pollIntervalMinutes: 15, createdAt: old, lastPolledAt: hourAgo }))).returning();
  await db.insert(scouts).values([
    { tenantId, name: "Normal daily fixture", targetUrl: "https://example.com/daily", platform: "rss", goalCondition: "New article", pollIntervalMinutes: 1440, createdAt: hourAgo },
    { tenantId, name: "Paused fixture", targetUrl: "https://example.com/paused", platform: "rss", goalCondition: "New article", pollIntervalMinutes: 15, createdAt: old, isActive: false },
  ]);
  await db.insert(scoutEvaluations).values([
    { tenantId, scoutId: scout.id, configKey: scoutConfigurationKey(scout), eventKey: "recent-failure", status: "failed", createdAt: recent, updatedAt: recent },
    { tenantId, scoutId: scout.id, configKey: scoutConfigurationKey(scout), eventKey: "old-failure", status: "failed", createdAt: old, updatedAt: old },
    { tenantId, scoutId: scout.id, configKey: scoutConfigurationKey(scout), eventKey: "uncertain", status: "uncertain", createdAt: old, updatedAt: old },
    { tenantId: foreignId, scoutId: foreignScout.id, configKey: scoutConfigurationKey(foreignScout), eventKey: "foreign-failure", status: "failed", createdAt: recent, updatedAt: recent },
  ]);
  await db.insert(mediaRenderJobs).values([
    { tenantId, inputHash: "recent-failure", spec: {}, status: "failed", updatedAt: recent },
    { tenantId, inputHash: "old-failure", spec: {}, status: "failed", updatedAt: old },
    { tenantId, inputHash: "stalled", spec: {}, status: "rendering", updatedAt: hourAgo },
    { tenantId, inputHash: "normal-queued", spec: {}, status: "queued", updatedAt: recent },
    { tenantId: foreignId, inputHash: "foreign-failure", spec: {}, status: "failed", updatedAt: recent },
  ]);
  const [, overdueClaim] = await db.insert(drafts).values([
    { tenantId, status: "failed" },
    { tenantId, status: "publishing", createdAt: old, errorMessage: `claimed:${hourAgo.getTime()}` },
    { tenantId, status: "publishing", createdAt: old, scheduledFor: tomorrow, errorMessage: `claimed:${hourAgo.getTime()}` },
    { tenantId: foreignId, status: "failed" },
    // An old draft entering publication now must not be called overdue.
    { tenantId, status: "publishing", createdAt: old, errorMessage: `claimed:${recent.getTime()}` },
    // Legacy timing is unknown; do not invent an age from draft creation.
    { tenantId, status: "publishing", createdAt: old, errorMessage: "claimed:invalid" },
  ]).returning();
  const [recentProvider, overdueProvider, recentRetry] = await db.insert(drafts).values([
    { tenantId, status: "publishing", createdAt: old },
    { tenantId, status: "publishing", createdAt: old },
    { tenantId, status: "publishing", createdAt: old, errorMessage: `claimed:${recent.getTime()}` },
  ]).returning();
  await db.insert(posts).values([
    { tenantId, draftId: recentProvider.id, content: "Recent provider submission", status: "publishing", publishedAt: recent },
    { tenantId, draftId: overdueProvider.id, content: "Overdue provider submission", status: "publishing", publishedAt: hourAgo },
    { tenantId, draftId: recentRetry.id, content: "Old submission with a new claim", status: "failed", publishedAt: old },
    // Even malformed cross-workspace linkage must not reset the claim's age.
    { tenantId: foreignId, draftId: overdueClaim.id, content: "Foreign timestamp", status: "publishing", publishedAt: recent },
  ]);
  const [page] = await db.insert(themePages).values({ tenantId, name: "Fixture page" }).returning();
  const [format] = await db.insert(themeContentFormats).values({ tenantId, slug: "fixture", name: "Fixture format", platform: "instagram", mediaType: "image", renderer: "puppeteer" }).returning();
  await db.insert(contentPackages).values([
    { tenantId, themePageId: page.id, formatId: format.id, title: "Failed fixture", status: "failed", updatedAt: old },
    { tenantId, themePageId: page.id, formatId: format.id, title: "Overdue fixture", status: "publishing", updatedAt: hourAgo },
    { tenantId, themePageId: page.id, formatId: format.id, title: "Future fixture", status: "publishing", updatedAt: old, scheduledFor: tomorrow },
  ]);
  const health = await getOperationalHealth(tenantId, now);
  assert.equal(health.scoutFailures24h, 1, "old/foreign Scout failures must not pollute workspace count");
  assert.equal(health.scoutUncertain, 1, "unresolved uncertain receipts remain visible beyond 24h");
  assert.equal(health.overdueScouts, 1, "normal daily and paused Scouts must not be marked overdue");
  assert.equal(health.renderFailures24h, 1, "old/foreign renders excluded");
  assert.equal(health.stalledRenders, 1, "recent queue admission is not a stalled render");
  assert.equal(health.publicationFailures, 2, "include failed Studio packages and chat drafts, exclude foreign workspace");
  assert.equal(health.pendingPublications, 3, "only old claims/provider submissions and overdue packages count; fresh claims/submissions, unknown ages and future schedules excluded");
  const clean = await getOperationalHealth(crypto.randomUUID(), now);
  for (const [key, value] of Object.entries(clean)) if (key !== "generatedAt") assert.equal(value, 0, `${key} leaked another workspace`);
  console.log("PASS: PostgreSQL operational health predicates, Scout intervals, overdue publications, unresolved uncertainty and workspace isolation.");
} catch (error) { failed = true; console.error(error); }
finally {
  // The format FK is restrictive; remove packages before tenant-owned formats.
  await db.delete(contentPackages).where(eq(contentPackages.tenantId, tenantId));
  await db.delete(tenants).where(inArray(tenants.id, [tenantId, foreignId]));
  process.exit(failed ? 1 : 0);
}
