import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { requireDisposableDatabase } from "./require-disposable-database";
await requireDisposableDatabase();
process.env.MEDIA_ENGINE_ENABLED = "false";
const { db } = await import("../../src/lib/db");
const schema = await import("../../src/lib/db/schema");
const { and, eq } = await import("drizzle-orm");
const { parseThemeDesign } = await import("../../src/lib/theme-studio/design-spec");
const { parseRssXml, parseHtmlMetadata } = await import("../../src/lib/theme-studio/pipeline/source-poller");
const { clusterSourceItems } = await import("../../src/lib/theme-studio/pipeline/story-clusterer");
const { synthesizeAndAllocatePackages } = await import("../../src/lib/theme-studio/pipeline/angle-synthesizer");
const { sourceMediaCandidates } = await import("../../src/lib/theme-studio/source-media");
const { importThemeSourceMedia } = await import("../../src/lib/theme-studio/import-source-media");
const { renderPackageMedia } = await import("../../src/lib/theme-studio/renderers/media-assembler");
const { assertThemeRenderCurrent } = await import("../../src/lib/media-engine/theme-adapter");
const { invalidateThemeMedia } = await import("../../src/lib/media-engine/invalidation");
const { bundledFontOptions } = await import("../../src/lib/theme-studio/renderers/font-layout");
const tenantId = crypto.randomUUID();
const bytes = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="orange"/></svg>').render().asPng();
let downloads = 0, uploads = 0, renderedCount = 0;
mkdirSync("output/theme-studio-release1", { recursive: true });
const operations = {
  request: async () => { downloads++; return { status: 200, buffer: Buffer.from(bytes), headers: new Headers(), url: "https://example.test/image.png" }; },
  upload: async (_bytes: Buffer, _mime: string, _tenant: string, options: { customKey?: string } = {}) => { uploads++; return { key: options.customKey!, publicUrl: `https://assets.example.test/${options.customKey}` }; },
  remove: async () => {},
};
const rasterize = async (svg: string) => {
  const renderer = new Resvg(svg, { font: bundledFontOptions });
  for (const url of renderer.imagesToResolve()) renderer.resolveImage(url, bytes);
  return Buffer.from(renderer.render().asPng());
};
const upload = async (input: { tenantId: string; key: string; filename: string; mimeType: string; body: Buffer }) => {
  writeFileSync(`output/theme-studio-release1/native-export-${++renderedCount}.png`, input.body);
  const [asset] = await db.insert(schema.assets).values({ tenantId, key: input.key, filename: input.filename.slice(0, 250), mimeType: input.mimeType, size: input.body.length, publicUrl: `https://assets.example.test/${input.key}` }).returning();
  return asset;
};
let failed = false;
try {
  await db.insert(schema.tenants).values({ id: tenantId, name: "Release 1 integration", slug: tenantId });
  const [page] = await db.insert(schema.themePages).values({ tenantId, name: "Joey Review", defaultRightsPolicy: "strict", brandKit: { watermark: "@joey" } }).returning();
  const [format] = await db.insert(schema.themeContentFormats).values({ tenantId, name: "Card", slug: "card", platform: "instagram", mediaType: "image", renderer: "puppeteer", aspectRatio: "4:5" }).returning();
  const design = parseThemeDesign({ templateFamily: "pubity_hero", accentColor: "#b6ff3b", highlightWords: ["Story"], showDivider: false, titleTemplate: "{{title}}", bodyTemplate: "{{summary}}" });
  const [template] = await db.insert(schema.themeVisualTemplates).values({ tenantId, themePageId: page.id, name: "Shared design", formatId: format.id, renderer: "puppeteer", componentSpec: design }).returning();
  assert.deepEqual(template.componentSpec, design, "saved design must round trip through jsonb");
  const fixtures = [
    parseRssXml('<rss><item><title>Basketball final result</title><link>https://sports.example.test/final</link><description>Home team wins the trophy.</description><enclosure url="https://sports.example.test/photo.png" type="image/png"/></item></rss>', "owned")[0],
    parseHtmlMetadata('<meta property="og:title" content="Space telescope observes distant galaxy"><meta property="og:description" content="Astronomers publish new observations."><meta property="og:image" content="https://space.example.test/photo.png">', "https://space.example.test/report", "owned")!,
    parseRssXml('<feed><entry><title>Music festival opens gates</title><link href="https://music.example.test/festival"/><summary>Fans arrive for the performances.</summary></entry></feed>', "owned")[0],
  ];
  for (const [index, item] of fixtures.entries()) {
    const [source] = await db.insert(schema.themeSources).values({ tenantId, themePageId: page.id, name: `Fixture ${index}`, sourceType: "rss", url: item.url, rightsCategory: "owned" }).returning();
    await db.insert(schema.sourceItems).values({ tenantId, themePageId: page.id, sourceId: source.id, title: item.title, body: item.body, url: item.url, publishedAt: item.publishedAt ?? null, rightsCategory: "owned", metadata: { ...item.metadata, mediaCandidates: sourceMediaCandidates(item.metadata, item.url, "owned") } });
    await db.insert(schema.themeSlots).values({ tenantId, themePageId: page.id, label: `Slot ${index}`, formatId: format.id, overrideTemplateId: template.id, priority: index });
  }
  const clustered = await clusterSourceItems(tenantId, page.id, undefined, { mode: "off" });
  assert.equal(clustered.clusteredCount, 3, "undated sources must not disappear");
  const result = await synthesizeAndAllocatePackages(tenantId, page.id, "release-1-fixture", undefined, undefined, async input => ({ title: `Story: ${input.cluster.title}`, caption: "Fresh editorial copy based on the report.", hashtags: ["#news"] }));
  assert.equal(result.packagesCreated, 3);
  const packages = await db.query.contentPackages.findMany({ where: eq(schema.contentPackages.tenantId, tenantId) });
  const withImage = packages.find(pkg => (pkg.provenance as any).mediaCandidates.length > 0)!;
  const candidate = (withImage.provenance as any).mediaCandidates[0];
  const imported = await importThemeSourceMedia(tenantId, withImage.id, candidate.url, undefined, operations as any);
  const reused = await importThemeSourceMedia(tenantId, withImage.id, candidate.url, undefined, operations as any);
  assert.equal(imported.id, reused.id);
  assert.equal(downloads, 1); assert.equal(uploads, 1, "retries must reuse the registered image");
  const reloaded = await db.query.contentPackages.findFirst({ where: eq(schema.contentPackages.id, withImage.id) });
  assert.equal((reloaded!.provenance as any).selectedMedia.assetVersion, imported.key);
  assert.equal((reloaded!.provenance as any).selectedMedia.rightsCategory, "owned");
  await assert.rejects(importThemeSourceMedia("another-workspace", withImage.id, candidate.url, undefined, operations as any), /cannot be edited/);
  await assert.rejects(importThemeSourceMedia(tenantId, withImage.id, "https://unlisted.example.test/image.png", undefined, operations as any), /declared ownership/);
  for (const pkg of packages) {
    const sourceImage = (pkg.provenance as any).mediaCandidates[0];
    if (sourceImage) await importThemeSourceMedia(tenantId, pkg.id, sourceImage.url, undefined, operations as any);
    const rendered = await renderPackageMedia(pkg.id, tenantId, undefined, undefined, undefined, { rasterize, upload });
    assert.equal(rendered.success, true, rendered.error);
    await assertThemeRenderCurrent(tenantId, pkg.id);
    const retry = await renderPackageMedia(pkg.id, tenantId, undefined, undefined, undefined, { rasterize, upload });
    assert.deepEqual(retry.renderedUrls, rendered.renderedUrls, "unchanged render retry must reuse output");
  }
  const old = await db.query.contentPackages.findFirst({ where: eq(schema.contentPackages.id, withImage.id) });
  await db.update(schema.contentPackages).set({ title: "Edited headline", renderedAssetUrls: [], updatedAt: new Date() }).where(eq(schema.contentPackages.id, withImage.id));
  await assert.rejects(assertThemeRenderCurrent(tenantId, withImage.id), /changed/);
  const edited = await renderPackageMedia(withImage.id, tenantId, undefined, undefined, undefined, { rasterize, upload });
  assert.equal(edited.success, true);
  assert.notEqual(edited.renderedUrls[0].url, (old!.renderedAssetUrls as any)[0].url, "headline edits need a new immutable output key");
  await db.transaction(async tx => { await tx.update(schema.themeVisualTemplates).set({ componentSpec: { ...design, accentColor: "#20cfbb" }, version: 2 }).where(eq(schema.themeVisualTemplates.id, template.id)); await invalidateThemeMedia(tx, tenantId, { kind: "template", id: template.id }, true); });
  const stale = await renderPackageMedia(withImage.id, tenantId, undefined, undefined, undefined, { rasterize, upload: async input => {
    const asset = await upload(input);
    await db.update(schema.contentPackages).set({ title: "Newer edit wins", metrics: { failurePhase: "render_required" }, renderedAssetUrls: [], updatedAt: new Date() }).where(eq(schema.contentPackages.id, withImage.id));
    return asset;
  } });
  assert.equal(stale.success, false);
  const newer = await db.query.contentPackages.findFirst({ where: and(eq(schema.contentPackages.id, withImage.id), eq(schema.contentPackages.tenantId, tenantId)) });
  assert.equal(newer!.title, "Newer edit wins"); assert.deepEqual(newer!.renderedAssetUrls, []); assert.equal(newer!.status, "pending_review");
  const [source] = await db.query.themeSources.findMany({ where: eq(schema.themeSources.tenantId, tenantId), limit: 1 });
  await db.insert(schema.sourceItems).values({ tenantId, themePageId: page.id, sourceId: source.id, title: "Abandoned astronomy claim", body: "Recovery evidence", url: "https://example.test/recovery", status: "clustering", rightsCategory: "owned", metadata: { clusteringClaimedAt: new Date(Date.now() - 700000).toISOString(), clusteringClaimToken: "abandoned-worker" } });
  assert.equal((await clusterSourceItems(tenantId, page.id, undefined, { mode: "off" })).clusteredCount, 1, "abandoned source claims must recover");
  console.log("PASS: three source fixtures → clustering → editorial copy → canonical saved design → image import/reload → exports, missing image, retry reuse and stale completion fencing");
} catch (error) { failed = true; console.error(error); } finally {
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  process.exit(failed ? 1 : 0);
}
