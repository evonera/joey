import assert from "node:assert/strict";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
const { db } = await import("../../src/lib/db");
const { tenants, themePages, themeContentFormats, themeSlots, mixRecommendations } = await import("../../src/lib/db/schema");
const { eq } = await import("drizzle-orm");
const { acceptMixRecommendation } = await import("../../src/lib/theme-studio/learning/recipe-optimizer");
const tenantId = crypto.randomUUID();
let failed = false;
try {
  await db.insert(tenants).values({ id: tenantId, name: "Audit mix", slug: tenantId });
  const [page] = await db.insert(themePages).values({ tenantId, name: "Audit" }).returning();
  const [format] = await db.insert(themeContentFormats).values({ tenantId, name: "Card", slug: "audit-card", platform: "instagram", mediaType: "image", renderer: "puppeteer", aspectRatio: "4:5" }).returning();
  const [a, b] = await db.insert(themeSlots).values([
    { tenantId, themePageId: page.id, formatId: format.id, priority: 0 },
    { tenantId, themePageId: page.id, formatId: format.id, priority: 1 },
  ]).returning();
  async function recommendation() {
    const [row] = await db.insert(mixRecommendations).values({ tenantId, themePageId: page.id, formatScores: {}, adjustments: [
      { slotId: a.id, formatId: format.id, previousPriority: 0, newPriority: 1 },
      { slotId: b.id, formatId: format.id, previousPriority: 1, newPriority: 0 },
    ] }).returning();
    return row;
  }
  const stale = await recommendation();
  await db.update(themeSlots).set({ priority: 8 }).where(eq(themeSlots.id, b.id));
  await assert.rejects(acceptMixRecommendation(tenantId, stale.id), /content mix changed/);
  assert.equal((await db.query.mixRecommendations.findFirst({ where: eq(mixRecommendations.id, stale.id) }))?.status, "pending");
  assert.equal((await db.query.themeSlots.findFirst({ where: eq(themeSlots.id, a.id) }))?.priority, 0);
  await db.update(themeSlots).set({ priority: 1 }).where(eq(themeSlots.id, b.id));
  assert.deepEqual(await acceptMixRecommendation(tenantId, stale.id), { accepted: true, applied: 2 });
  assert.deepEqual(await acceptMixRecommendation(tenantId, stale.id), { accepted: false, applied: 0 });
  console.log("PASS: stale recommendation rolls back and successful acceptance is atomic");
} catch (error) { console.error(error); failed = true; }
finally {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  process.exit(failed ? 1 : 0);
}
