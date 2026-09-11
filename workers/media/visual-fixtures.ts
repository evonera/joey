import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderSpecSchema, RENDERER_VERSION, FONT_VERSION } from "../../src/lib/media-engine/spec";
import { renderTemplateHtml } from "../../src/lib/media-engine/templates";
const directory = resolve(process.argv[2] ?? "/tmp/joey-media-visual-cases");
await mkdir(directory, { recursive: true });
const cases = [
  { name: "emoji", title: "Small moments, big stories ☕ 🏆", template: "photo_headline", error: false },
  { name: "overflow", title: "WWWWWWWWWWWWWWWWWWWW ".repeat(23).trim(), template: "photo_headline", error: true },
  { name: "inset", title: "A new perspective on today's biggest story", template: "photo_inset", error: false },
  { name: "silent", title: "A quiet moment worth sharing ☕", template: "minimal_meme", error: false },
];
for (const test of cases) {
  const video = test.name === "silent";
  const media = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version: "visual-fixture-1" };
  const spec = renderSpecSchema.parse({ version: 1, source: { kind: "flow", id: "visual-fixture", revision: "1" }, template: test.template, templateVersion: 1, format: video ? "mp4" : "png", title: test.title, brand: { name: "Joey News", handle: "@joey" }, media, ...(test.name === "inset" ? { inset: media } : {}), crop: { mode: "cover", x: .9, y: .1 }, ...(video ? { video: { duration: 15, captions: true } } : {}) });
  await writeFile(resolve(directory, `${test.name}.json`), JSON.stringify({ ...await renderTemplateHtml(spec), spec, rendererVersion: RENDERER_VERSION, fontVersion: FONT_VERSION, inputs: [{ id: media.id, url: "fixture" }], expectOverflow: test.error }));
}
