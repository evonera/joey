import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { renderHash, renderSpecSchema, rendererVersion } from "../spec";
import { verifyWorkerRequest } from "../auth";
import { renderTemplateHtml } from "../templates";
const base = { version: 1, source: { kind: "flow", id: "flow", revision: "1" }, template: "photo_headline", templateVersion: 1, format: "png", media: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version: "asset-key" }, title: "A headline", brand: { name: "Science", handle: "@science" } };
afterEach(() => vi.unstubAllEnvs());
describe("MediaEngine contract", () => {
  it("fills the whole video frame while preserving trim, audio, crop and branding", async () => {
    const spec = renderSpecSchema.parse({ ...base, template: "full_frame", format: "mp4", crop: { mode: "cover", x: .2, y: .8 }, video: { start: 1.2, duration: 2.4, sourceAudio: false, zoom: 1.1 } });
    const rendered = await renderTemplateHtml(spec);
    expect(rendered.videoRect).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
    expect(rendererVersion(spec)).toBe("joey-media-4");
    expect(spec.video).toMatchObject({ start: 1.2, duration: 2.4, sourceAudio: false, zoom: 1.1 });
    expect(spec.crop).toEqual({ mode: "cover", x: .2, y: .8 });
    expect(rendered.html).toContain("@science");
    expect(rendered.html).toContain("Science");
    expect(rendered.html).toContain("rgba(0,0,0,.65)");
    expect(renderHash(spec)).not.toBe(renderHash({ ...spec, template: "branded_clip" }));
  });
  it("hashes normalized defaults and includes source revisions", () => {
    const spec = renderSpecSchema.parse(base);
    expect(renderHash(spec)).toBe(renderHash({ ...spec, crop: { mode: "contain", x: .5, y: .5 } }));
    expect(renderHash(spec)).not.toBe(renderHash({ ...spec, source: { ...spec.source, revision: "2" } }));
  });
  it("accepts a saved draft as the source of a finished video", () => {
    const result = renderSpecSchema.safeParse({
      ...base,
      source: { kind: "draft", id: "draft-1", revision: "revision-1" },
      template: "branded_clip",
      format: "mp4",
      video: { start: 0, duration: 15, captions: false, zoom: 1, sourceAudio: true, words: [] },
    });
    expect(result.success).toBe(true);
  });
  it("rejects invalid template/format combinations and fabricated caption timing", () => {
    expect(renderSpecSchema.safeParse({ ...base, format: "mp4" }).success).toBe(false);
    expect(renderSpecSchema.safeParse({ ...base, template: "minimal_meme", format: "mp4", video: { duration: 10, words: [{ text: "word", start: 9, end: 11 }] } }).success).toBe(false);
  });
  it("escapes text so data cannot add HTML, scripts or resource URLs", async () => {
    const spec = renderSpecSchema.parse({ ...base, title: '<img src="file:///private" onerror="alert(1)">' });
    const { html } = await renderTemplateHtml(spec);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain('<img src="file:');
    expect(html).not.toContain("<script");
  });
  it("rejects unsigned, stale and altered worker payloads", () => {
    vi.stubEnv("MEDIA_WORKER_SECRET", "a".repeat(32));
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", "a".repeat(32)).update(`${timestamp}.{}`).digest("hex");
    expect(verifyWorkerRequest("{}", timestamp, signature)).toBe(true);
    expect(verifyWorkerRequest('{"success":true}', timestamp, signature)).toBe(false);
    expect(verifyWorkerRequest("{}", String(Date.now() - 600_000), signature)).toBe(false);
    expect(verifyWorkerRequest("{}", timestamp, null)).toBe(false);
  });
});
