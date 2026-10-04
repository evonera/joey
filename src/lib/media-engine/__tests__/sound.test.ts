import { describe, expect, it, vi } from "vitest";
import { soundCuesSchema } from "../sound";
import { renderSpecSchema, renderHash } from "../spec";
vi.mock("@/lib/db", () => ({ db: {} }));
import { timelineTranscriptHash } from "../transcription";
const ref = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version: "source" };
const input = { version: 2, source: { kind: "theme_package", id: "pkg", revision: "revision" }, template: "branded_clip", templateVersion: 1, format: "mp4", title: "Headline", brand: { name: "Joey", handle: "@joey" }, timeline: [{ kind: "video", asset: ref, crop: { mode: "contain", x: .5, y: .5 }, trimStartFrame: 0, durationFrames: 90, headline: "Clip", transition: "cut" }], video: { duration: 3, captions: true } };
describe("Sparse sound design", () => {
  it("bounds cues, gain, timing and gap", () => {
    const cue = { effect: "pop", frame: 0, gain: .2 };
    for (const cues of [[{ ...cue, effect: "arbitrary-file" }], [{ ...cue, gain: 1 }], [cue, { ...cue, frame: 29 }], Array(7).fill(cue)]) expect(soundCuesSchema.safeParse(cues).success).toBe(false);
    expect(renderSpecSchema.safeParse({ ...input, soundCues: [{ ...cue, frame: 90 }] }).success).toBe(false);
  });
  it("caches assembled speech independently from branding, images, music and SFX", () => {
    const spec = renderSpecSchema.parse(input);
    if (spec.version !== 2) throw new Error("Expected timeline");
    const changed = renderSpecSchema.parse({ ...input, title: "New headline", brand: { name: "New brand", handle: "@new" }, music: { ...ref, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, soundCues: [{ effect: "ding", frame: 0, gain: .2 }], timeline: [{ ...input.timeline[0], headline: "Different pixels" }] });
    if (changed.version !== 2) throw new Error("Expected timeline");
    expect(timelineTranscriptHash(spec)).toBe(timelineTranscriptHash(changed));
    expect(renderHash(spec)).not.toBe(renderHash(changed));
    const trimmed = renderSpecSchema.parse({ ...input, timeline: [{ ...input.timeline[0], trimStartFrame: 15 }] });
    if (trimmed.version !== 2) throw new Error("Expected timeline");
    expect(timelineTranscriptHash(spec)).not.toBe(timelineTranscriptHash(trimmed));
  });
});
