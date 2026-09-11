import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { renderHash, renderSpecSchema } from "../spec";
import { verifyWorkerRequest } from "../auth";
import { renderTemplateHtml } from "../templates";
const base = { version: 1, source: { kind: "flow", id: "flow", revision: "1" }, template: "photo_headline", templateVersion: 1, format: "png", media: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version: "asset-key" }, title: "A headline", brand: { name: "Science", handle: "@science" } };
afterEach(() => vi.unstubAllEnvs());
describe("MediaEngine contract", () => {
  it("hashes normalized defaults and includes source revisions", () => {
    const spec = renderSpecSchema.parse(base);
    expect(renderHash(spec)).toBe(renderHash({ ...spec, crop: { mode: "contain", x: .5, y: .5 } }));
    expect(renderHash(spec)).not.toBe(renderHash({ ...spec, source: { ...spec.source, revision: "2" } }));
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
