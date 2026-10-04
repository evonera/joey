import { createHash } from "node:crypto";
import { z } from "zod";
import { timelineSchema, timelineFrames, timelineAssetSchema } from "./timeline";

export const RENDERER_VERSION = "joey-media-1";
export const FONT_VERSION = "joey-fonts-1";
const asset = timelineAssetSchema;
const baseSchema = z.object({
  version: z.literal(1),
  source: z.object({ kind: z.enum(["theme_package", "flow", "draft"]), id: z.string().min(1).max(128), revision: z.string().min(1).max(128) }).strict(),
  template: z.enum(["photo_headline", "photo_inset", "branded_clip", "minimal_meme"]),
  templateVersion: z.literal(1),
  format: z.enum(["png", "mp4"]),
  media: asset,
  inset: asset.optional(),
  music: asset.optional(),
  title: z.string().trim().min(1).max(500),
  brand: z.object({ name: z.string().max(100), handle: z.string().max(100), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffe633") }).strict(),
  crop: z.object({ mode: z.enum(["contain", "cover"]), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict().default({ mode: "contain", x: 0.5, y: 0.5 }),
  video: z.object({
    start: z.number().min(0).max(86400).default(0), duration: z.number().min(1).max(60),
    captions: z.boolean().default(false),
    zoom: z.number().min(1).max(1.15).default(1), sourceAudio: z.boolean().default(true),
    words: z.array(z.object({ text: z.string().min(1).max(80), start: z.number().min(0), end: z.number().positive() }).strict()).max(500).default([]),
  }).strict().optional(),
}).strict();
const legacySchema = baseSchema.superRefine((spec, ctx) => {
  if ((spec.format === "mp4") !== Boolean(spec.video)) ctx.addIssue({ code: "custom", message: "MP4 output requires video timing; PNG output cannot include video timing." });
  if ((spec.format === "mp4") !== ["branded_clip", "minimal_meme"].includes(spec.template)) ctx.addIssue({ code: "custom", message: "Template and output format do not match." });
  if (spec.template === "photo_inset" && !spec.inset) ctx.addIssue({ code: "custom", message: "Photo inset requires an inset asset." });
  if (spec.video?.captions && spec.video.words.length) ctx.addIssue({ code: "custom", message: "Choose automatic captions or supplied timing, not both." });
  if (spec.format === "png" && spec.music) ctx.addIssue({ code: "custom", message: "Music requires a video output." });
  if (spec.template !== "photo_inset" && spec.inset) ctx.addIssue({ code: "custom", message: "Inset images require the photo inset template." });
  let previous = 0;
  for (const word of spec.video?.words ?? []) {
    if (word.start < previous || word.end <= word.start || word.end > spec.video!.duration) ctx.addIssue({ code: "custom", message: "Caption timing must be ordered and within the trimmed video." });
    previous = word.end;
  }
});
const timelineRenderSchema = baseSchema.extend({
  version: z.literal(2), format: z.literal("mp4"),
  template: z.enum(["branded_clip", "minimal_meme"]), media: asset.optional(),
  timeline: timelineSchema,
}).strict().superRefine((spec, ctx) => {
  if (!spec.video || Math.abs(spec.video.duration * 30 - timelineFrames(spec.timeline)) > 0.000001 || spec.video.start !== 0 || spec.video.zoom !== 1) ctx.addIssue({ code: "custom", message: "Video timing must match the assembled frame timeline." });
  if (spec.media || spec.inset) ctx.addIssue({ code: "custom", message: "Timeline inputs belong to their scenes." });
  if (spec.music || spec.video?.captions || spec.video?.words.length) ctx.addIssue({ code: "custom", message: "Timeline sound design is not enabled in this renderer release." });
  if (spec.video?.captions && spec.video.words.length) ctx.addIssue({ code: "custom", message: "Choose automatic captions or supplied timing, not both." });
  let previous = 0;
  for (const word of spec.video?.words ?? []) {
    if (word.start < previous || word.end <= word.start || word.end > spec.video!.duration) ctx.addIssue({ code: "custom", message: "Caption timing must be ordered and within the timeline." });
    previous = word.end;
  }
});
export const renderSpecSchema = z.union([legacySchema, timelineRenderSchema]);
export type RenderSpec = z.infer<typeof renderSpecSchema>;
export function rendererVersion(spec: RenderSpec) { return spec.version === 2 ? "joey-media-2" : RENDERER_VERSION; }
export function renderHash(spec: RenderSpec) {
  return createHash("sha256").update(JSON.stringify({ renderer: rendererVersion(spec), fonts: FONT_VERSION, spec: renderSpecSchema.parse(spec) })).digest("hex");
}
export function referencedAssets(spec: RenderSpec) {
  const refs = spec.version === 2 ? [...spec.timeline.flatMap(scene => scene.kind === "card" ? [] : [scene.asset]), spec.music] : [spec.media, spec.inset, spec.music];
  return refs.filter((item): item is z.infer<typeof asset> => Boolean(item));
}
export function expectedAssetTypes(spec: RenderSpec, id: string): string[] {
  if (spec.version === 1) return referencedAssets(spec).filter(ref => ref.id === id).map(ref => ref === spec.music ? "audio/" : ref === spec.media && spec.format === "mp4" ? "video/" : "image/");
  return [...spec.timeline.flatMap(scene => scene.kind !== "card" && scene.asset.id === id ? [scene.kind === "video" ? "video/" : "image/"] : []), ...(spec.music?.id === id ? ["audio/"] : [])];
}
