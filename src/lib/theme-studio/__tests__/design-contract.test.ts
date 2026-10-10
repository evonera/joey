import { describe, expect, it } from "vitest";
import { parseThemeDesign, themeRenderSettingsSchema } from "../design-spec";
import { parseHtmlMetadata, parseRssXml } from "../pipeline/source-poller";
import { packageMediaCandidates, sourceMediaCandidates } from "../source-media";
import { fitText, measuredTextWidth } from "../renderers/font-layout";
import { renderCardSvg } from "../renderers/static-card-renderer";

describe("Theme Studio saved design contract", () => {
  it("retains editorial layout, source image, inset, divider and highlights across JSON persistence and export", () => {
    const design = parseThemeDesign({ templateFamily: "morning_brew_cyan", imageUrl: "https://example.com/photo.jpg", highlightKeywords: ["RECORD", "VICTORY"], showDividerMark: false, pipInsetUrl: "https://example.com/inset.jpg", accentColor: "#00e5ff", bgType: "photo" });
    const reloaded = parseThemeDesign(JSON.parse(JSON.stringify(design)));
    expect(reloaded).toEqual(design);
    expect(reloaded).not.toHaveProperty("imageUrl");
    const svg = renderCardSvg({ title: "RECORD VICTORY with the whole headline intact", imageUrl: reloaded.bgImageUrl, pipInsetUrl: reloaded.pipInsetUrl, highlightWords: reloaded.highlightWords, showDividerMark: reloaded.showDivider, brandKit: { accentColor: reloaded.accentColor } });
    expect(svg).toContain("https://example.com/photo.jpg");
    expect(svg).toContain("https://example.com/inset.jpg");
    expect(svg).toContain('fill="#00e5ff" font-weight="bold">RECORD');
    expect(svg).toContain('fill="#00e5ff" font-weight="bold">VICTORY');
    expect(svg).toContain("whole headline");
    expect(svg).toContain(">intact</text>");
    expect(svg).not.toContain("Divider with Centered Logo");
  });
  it("rejects unsupported controls and local or script media instead of silently dropping them", () => {
    expect(() => parseThemeDesign({ fictionalLayout: true })).toThrow();
    expect(() => parseThemeDesign({ bgImageUrl: "file:///private/a.png" })).toThrow();
    expect(() => parseThemeDesign({ pipInsetUrl: "javascript:alert(1)" })).toThrow();
  });
  it("retains crop, trim, audio and zoom settings", () => {
    const settings = { mediaAssetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", templateFamily: "branded_clip", cropMode: "cover", cropX: .25, cropY: .8, durationSeconds: 7, trimStart: 3, captions: true, zoom: 1.08, sourceAudio: false };
    expect(themeRenderSettingsSchema.parse(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });
  it("measures glyph widths and fits wide, multilingual and unbroken headlines inside the allotted box", () => {
    expect(measuredTextWidth("WWWW", "Inter", 48)).toBeGreaterThan(measuredTextWidth("iiii", "Inter", 48));
    for (const title of ["A new record for the league's longest winning streak", "தமிழ் வெற்றி ☕ NBA victory", "W".repeat(80)]) {
      const fitted = fitText(title, { font: "Inter", size: 72, minSize: 28, width: 700, height: 350, lineHeight: 1.18 });
      expect(fitted.lines.join("").replaceAll(" ", "")).toBe(title.replaceAll(" ", ""));
      expect(fitted.lines.every(line => measuredTextWidth(line, "Inter", fitted.size) <= 700)).toBe(true);
      expect(fitted.lines.length * fitted.size * 1.18).toBeLessThanOrEqual(350);
    }
  });
});

describe("source image provenance", () => {
  it("extracts RSS enclosure, media thumbnail and inline image candidates with attribution", () => {
    const [item] = parseRssXml(`<rss><item><title>Story</title><link>https://example.com/news/story</link><enclosure url="https://example.com/hero.jpg" type="image/jpeg"/><media:thumbnail url="/thumb.png"/><description><![CDATA[<p>Report<img src="/inline.png"/></p>]]></description></item></rss>`, "cc_by");
    const candidates = sourceMediaCandidates(item.metadata, item.url, item.rightsCategory);
    expect(candidates.map(item => item.url)).toEqual(["https://example.com/hero.jpg", "https://example.com/thumb.png", "https://example.com/inline.png"]);
    expect(candidates.every(item => item.rightsCategory === "cc_by" && item.credit === "example.com")).toBe(true);
    expect(packageMediaCandidates({ mediaCandidates: candidates })).toEqual(candidates);
  });
  it("keeps missing publication time unknown and reads a real OpenGraph publication timestamp", () => {
    const html = '<meta property="og:title" content="Story"><meta property="og:image" content="https://example.com/hero.jpg">';
    expect(parseHtmlMetadata(html, "https://example.com/story")?.publishedAt).toBeUndefined();
    expect(parseHtmlMetadata(html + '<meta property="article:published_time" content="2026-10-09T12:00:00Z">', "https://example.com/story")?.publishedAt?.toISOString()).toBe("2026-10-09T12:00:00.000Z");
  });
});
