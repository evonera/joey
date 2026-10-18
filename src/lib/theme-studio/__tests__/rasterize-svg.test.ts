import { describe, expect, it, vi } from "vitest";
import { Resvg } from "@resvg/resvg-js";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/flows/outbound-request", () => ({ outboundRequest: request }));
import { renderSvgPng } from "../renderers/rasterize-svg";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://example.com/hero.png" width="10" height="10"/></svg>';
describe("rendered template images", () => {
  it("exports the saved crop focus and contain mode using real image pixels", async () => {
    const split = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="4" height="4" fill="red"/><rect x="4" width="4" height="4" fill="blue"/></svg>').render().asPng();
    request.mockResolvedValue({ status: 200, buffer: split });
    async function pixels(mode: string, x: number) {
      const cropped = await renderSvgPng(svg.replace('width="10" height="10"', 'width="4" height="4"').replace("hero.png", `hero.png#joey-crop=${mode},${x},0.5,4,4`));
      return new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><image href="data:image/png;base64,${cropped.toString("base64")}" width="4" height="4"/></svg>`).render().pixels;
    }
    expect([...(await pixels("cover", 0)).subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...(await pixels("cover", 1)).subarray(0, 4)]).toEqual([0, 0, 255, 255]);
    expect([...(await pixels("contain", .5)).subarray(0, 4)]).toEqual([0, 0, 0, 255]);
  });
  it("includes remote image pixels in the exported PNG", async () => {
    const red = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>').render().asPng();
    request.mockResolvedValue({ status: 200, buffer: red });
    // Without explicit resolution, the exact same SVG is transparent.
    expect(new Resvg(svg).render().pixels[3]).toBe(0);
    const png = await renderSvgPng(svg);
    const embedded = svg.replace("https://example.com/hero.png", `data:image/png;base64,${png.toString("base64")}`);
    expect([...new Resvg(embedded).render().pixels.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(request).toHaveBeenCalledWith("https://example.com/hero.png", expect.objectContaining({ maxBytes: 5 * 1024 * 1024, timeoutMs: 15_000 }));
  }, 30_000);
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
