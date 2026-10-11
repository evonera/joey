import { bundledFontOptions } from "./font-layout";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { outboundRequest } from "@/lib/flows/outbound-request";

/** Resolve remote image bytes explicitly: resvg does not fetch them itself. */
export async function renderSvgPng(svg: string, signal?: AbortSignal, cache = new Map<string, Buffer>()): Promise<Buffer> {
  signal?.throwIfAborted();
  // Only our escaped template output belongs here. Reject local/inline resource
  // references BEFORE constructing Resvg: it opens local image paths eagerly,
  // so checking imagesToResolve() afterwards cannot protect the filesystem.
  if (Buffer.byteLength(svg) > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(svg)) {
    throw new Error("Invalid or oversized template SVG.");
  }
  for (const match of svg.matchAll(/\b(?:[\w.-]+:)?href\s*=\s*(["'])([\s\S]*?)\1/g)) {
    if (!/^https?:\/\//i.test(match[2]) && !match[2].startsWith("#")) {
      throw new Error("Template image references must use HTTP or HTTPS URLs.");
    }
  }
  const renderer = new Resvg(svg, { background: "rgba(0, 0, 0, 0)", font: bundledFontOptions });
  if (renderer.width > 4096 || renderer.height > 4096) throw new Error("Template dimensions cannot exceed 4096 pixels.");
  const images = [...new Set(renderer.imagesToResolve())];
  if (images.length > 8) throw new Error("A card can contain at most eight external images.");
  for (const href of images) {
    signal?.throwIfAborted();
    let bytes = cache.get(href);
    if (!bytes) {
      const response = await outboundRequest(href, { signal, timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024, maxRedirects: 3 });
      if (response.status < 200 || response.status >= 300) throw new Error(`A template image returned HTTP ${response.status}.`);
      bytes = response.buffer;
      const raster = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        || (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        || ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())
        || (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP");
      if (!raster) throw new Error("Template images must be PNG, JPEG, GIF or WebP files.");
      const crop = new URL(href).hash.match(/^#joey-crop=(contain|cover),([\d.]+),([\d.]+),(\d+),(\d+)$/);
      if (crop) {
        const x = Number(crop[2]), y = Number(crop[3]), width = Number(crop[4]), height = Number(crop[5]);
        if (x > 1 || y > 1 || width > 4096 || height > 4096 || width < 1 || height < 1) throw new Error("Invalid source crop.");
        const image = sharp(bytes, { limitInputPixels: 16_000_000 }).rotate();
        const meta = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
        const rotated = [5, 6, 7, 8].includes(meta.orientation ?? 0);
        const sourceWidth = rotated ? meta.height : meta.width, sourceHeight = rotated ? meta.width : meta.height;
        if (!sourceWidth || !sourceHeight) throw new Error("Source image dimensions are unavailable.");
        if (crop[1] === "contain") bytes = await image.resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } }).png().toBuffer();
        else {
          const scale = Math.max(width / sourceWidth, height / sourceHeight);
          const scaledWidth = Math.max(width, Math.round(sourceWidth * scale)), scaledHeight = Math.max(height, Math.round(sourceHeight * scale));
          bytes = await image.resize(scaledWidth, scaledHeight, { fit: "fill" }).extract({ left: Math.round((scaledWidth - width) * x), top: Math.round((scaledHeight - height) * y), width, height }).png().toBuffer();
        }
      }
      cache.set(href, bytes);
    }
    renderer.resolveImage(href, bytes);
  }
  signal?.throwIfAborted();
  return Buffer.from(renderer.render().asPng());
}
