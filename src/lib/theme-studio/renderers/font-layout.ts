import { Resvg } from "@resvg/resvg-js";
import path from "node:path";

export const bundledFontOptions = {
  loadSystemFonts: false,
  fontFiles: ["Inter.ttf", "Anton.ttf", "Emoji.ttf"].map(file => path.join(process.cwd(), "workers/media/fonts", file)),
  defaultFontFamily: "Inter", sansSerifFamily: "Inter",
};
const widthCache = new Map<string, number>();
function xml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"); }

/** Measure shaped glyphs using the exact fonts used for the PNG export. */
export function measuredTextWidth(text: string, font: "Inter" | "Anton", size: number, weight = 900) {
  const key = `${font}:${size}:${weight}:${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  const renderer = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="512"><text x="0" y="200" font-family="${font}" font-size="${size}" font-weight="${weight}">${xml(text)}</text></svg>`, { font: bundledFontOptions });
  const box = renderer.getBBox();
  const width = box ? box.x + box.width : 0;
  if (widthCache.size > 5000) widthCache.clear();
  widthCache.set(key, width);
  return width;
}

export function fitText(text: string, options: { font: "Inter" | "Anton"; size: number; minSize: number; width: number; height: number; lineHeight: number; weight?: number }) {
  const words = text.replace(/\*([^*]+)\*/g, "$1").split(/\s+/).filter(Boolean);
  for (let size = options.size; size >= options.minSize; size--) {
    const lines: string[] = [];
    let line = "";
    const measure = (value: string) => measuredTextWidth(value, options.font, size, options.weight ?? 900);
    for (const word of words) {
      if (measure(word) > options.width) {
        if (line) { lines.push(line); line = ""; }
        const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word), item => item.segment);
        for (const grapheme of graphemes) {
          if (line && measure(line + grapheme) > options.width) { lines.push(line); line = ""; }
          line += grapheme;
        }
      } else if (line && measure(`${line} ${word}`) > options.width) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    if (lines.length * size * options.lineHeight <= options.height && lines.every(value => measure(value) <= options.width)) return { lines, size };
  }
  throw new Error("Text does not fit this design. Shorten the copy or choose a taller format.");
}
