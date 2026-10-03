import { describe, expect, it } from "vitest";
import { timelineSchema, timelineFrames, sceneBoundaries } from "../timeline";
import { expectedAssetTypes, referencedAssets, rendererVersion, renderHash, renderSpecSchema } from "../spec";
const card = { kind: "card", durationFrames: 90, headline: "CTA", transition: "cut" };
const ref = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version: "key" };
const base = { version: 2, source: { kind: "theme_package", id: "pkg", revision: "rev" }, template: "branded_clip", templateVersion: 1, format: "mp4", title: "Title", brand: { name: "Joey", handle: "@joey" }, timeline: [card], video: { duration: 3 } };
describe("Frame timeline", () => {
  it("subtracts fade overlaps once and keeps a common frame clock", () => {
    const scenes = timelineSchema.parse([{ ...card, transition: "fade" }, card, card]);
    expect(timelineFrames(scenes)).toBe(258);
    expect(sceneBoundaries(scenes)).toEqual([{ startFrame: 0, endFrame: 90, overlapFrames: 12 }, { startFrame: 78, endFrame: 168, overlapFrames: 0 }, { startFrame: 168, endFrame: 258, overlapFrames: 0 }]);
  });
  it("bounds scene counts, final transitions, duration and executable input", () => {
    for (const scenes of [[], Array(7).fill(card), [{ ...card, transition: "fade" }], [{ ...card, durationFrames: 1801 }], [{ ...card, durationFrames: 29 }], [{ ...card, html: "<script/>" }], [{ ...card, transition: "wipeleft" }]]) expect(timelineSchema.safeParse(scenes).success).toBe(false);
    expect(renderSpecSchema.safeParse({ ...base, video: { duration: 4 } }).success).toBe(false);
  });
  it("uses v2 identity without changing the legacy renderer", () => {
    const spec = renderSpecSchema.parse(base);
    expect(rendererVersion(spec)).toBe("joey-media-2");
    expect(referencedAssets(spec)).toEqual([]);
    expect(renderHash(spec)).not.toBe(renderHash(renderSpecSchema.parse({ ...base, timeline: [{ ...card, headline: "Changed" }] })));
    const { timeline: _timeline, ...legacyBase } = base;
    const legacy = renderSpecSchema.parse({ ...legacyBase, version: 1, media: ref });
    expect(rendererVersion(legacy)).toBe("joey-media-1");
  });
  it("enumerates all owned assets and rejects conflicting MIME expectations", () => {
    const scene = { headline: "", durationFrames: 45, transition: "cut", crop: { mode: "contain", x: .5, y: .5 } };
    const spec = renderSpecSchema.parse({ ...base, timeline: [{ ...scene, kind: "video", asset: ref, trimStartFrame: 0 }, { ...scene, kind: "image", asset: ref }], video: { duration: 3 } });
    expect(referencedAssets(spec)).toEqual([ref, ref]);
    expect(expectedAssetTypes(spec, ref.id)).toEqual(["video/", "image/"]);
  });
});
