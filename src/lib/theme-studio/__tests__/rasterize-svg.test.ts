import { describe, expect, it, vi } from "vitest";
import { Resvg } from "@resvg/resvg-js";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/flows/outbound-request", () => ({ outboundRequest: request }));
import { renderSvgPng } from "../renderers/rasterize-svg";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://example.com/hero.png" width="10" height="10"/></svg>';
describe("rendered template images", () => {
  it("includes remote image pixels in the exported PNG", async () => {
    const red = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>').render().asPng();
    request.mockResolvedValue({ status: 200, buffer: red });
    // Without explicit resolution, the exact same SVG is transparent.
    expect(new Resvg(svg).render().pixels[3]).toBe(0);
    const png = await renderSvgPng(svg);
    const embedded = svg.replace("https://example.com/hero.png", `data:image/png;base64,${png.toString("base64")}`);
    expect([...new Resvg(embedded).render().pixels.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(request).toHaveBeenCalledWith("https://example.com/hero.png", expect.objectContaining({ maxBytes: 5 * 1024 * 1024, timeoutMs: 15_000 }));
  });
  it("fails visibly when an image URL returns an HTML error page", async () => {
    request.mockResolvedValue({ status: 200, buffer: Buffer.from("<html>Not an image</html>") });
    await expect(renderSvgPng(svg)).rejects.toThrow("PNG, JPEG, GIF or WebP");
  });
  it.each(["/tmp/private.png", "../private.png", "file:///tmp/private.png", "&#47;tmp/private.png", "data:image/svg+xml;base64,PHN2Zy8+"])("rejects %s before the native renderer can open it", async href => {
    request.mockClear();
    await expect(renderSvgPng(svg.replace("https://example.com/hero.png", href))).rejects.toThrow("HTTP or HTTPS");
    expect(request).not.toHaveBeenCalled();
  });
  it("escapes brand fonts before inserting them into SVG attributes", async () => {
    const { renderVideoReelSvg } = await import("../renderers/video-reel-renderer");
    const result = renderVideoReelSvg({ hookText: "A hook", brandKit: { fontFamily: '\"><image href="/tmp/private.png"/><text font-family="' } });
    expect(result).not.toContain('<image href="/tmp/private.png"');
    expect(result).toContain("&lt;image");
  });
});
