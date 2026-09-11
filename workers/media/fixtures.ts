/** Generate trusted compositions for the local/Modal benchmark; no external media. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderSpecSchema, FONT_VERSION, RENDERER_VERSION } from "../../src/lib/media-engine/spec";
import { renderTemplateHtml } from "../../src/lib/media-engine/templates";
const directory = resolve(process.argv[2] ?? "/tmp/joey-media-benchmark");
await mkdir(directory, { recursive: true });
for (const duration of [15, 30, 60]) {
  const spec = renderSpecSchema.parse({ version: 1, source: { kind: "flow", id: "benchmark", revision: "1" }, template: "branded_clip", templateVersion: 1, format: "mp4", title: "A clear headline above the original clip", brand: { name: "Joey News", handle: "@joey" }, media: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version: "synthetic-v1" }, video: { duration, words: [ { text: "Captions", start: 1, end: 1.5 }, { text: "follow", start: 1.6, end: 2 }, { text: "real", start: 2.1, end: 2.5 }, { text: "timing", start: 2.6, end: 3 } ] } });
  await writeFile(resolve(directory, `${duration}.json`), JSON.stringify({ ...await renderTemplateHtml(spec), spec, rendererVersion: RENDERER_VERSION, fontVersion: FONT_VERSION, inputs: [{ id: spec.media.id, url: "fixture" }] }));
}
console.log(`Benchmark compositions written to ${directory}`);
