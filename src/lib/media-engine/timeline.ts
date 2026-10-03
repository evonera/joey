import { z } from "zod";

export const TIMELINE_FPS = 30;
export const FADE_FRAMES = 12;
export const timelineAssetSchema = z.object({ id: z.uuid(), version: z.string().min(1).max(512) }).strict();
const placement = z.object({ mode: z.enum(["contain", "cover"]), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const common = {
  durationFrames: z.number().int().min(30).max(1800),
  headline: z.string().trim().max(500),
  transition: z.enum(["cut", "fade"]).default("cut"),
};
export const timelineSceneSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("video"), asset: timelineAssetSchema, trimStartFrame: z.number().int().min(0).max(86400 * 30), crop: placement, sourceAudio: z.boolean().default(true) }).strict(),
  z.object({ ...common, kind: z.literal("image"), asset: timelineAssetSchema, crop: placement }).strict(),
  z.object({ ...common, kind: z.literal("card"), headline: z.string().trim().min(1).max(500) }).strict(),
]);
export type TimelineScene = z.infer<typeof timelineSceneSchema>;
export function timelineFrames(scenes: Pick<TimelineScene, "durationFrames" | "transition">[]) {
  return scenes.reduce((total, scene, index) => total + scene.durationFrames - (index < scenes.length - 1 && scene.transition === "fade" ? FADE_FRAMES : 0), 0);
}
export function sceneBoundaries(scenes: TimelineScene[]) {
  let frame = 0;
  return scenes.map((scene, index) => {
    const startFrame = frame;
    frame += scene.durationFrames;
    const overlapFrames = index < scenes.length - 1 && scene.transition === "fade" ? FADE_FRAMES : 0;
    frame -= overlapFrames;
    return { startFrame, endFrame: startFrame + scene.durationFrames, overlapFrames };
  });
}
export const timelineSchema = z.array(timelineSceneSchema).min(1).max(6).superRefine((scenes, ctx) => {
  if (timelineFrames(scenes) > 1800) ctx.addIssue({ code: "custom", message: "Finished timeline must be 60 seconds or less." });
  if (scenes.at(-1)?.transition !== "cut") ctx.addIssue({ code: "custom", message: "The final scene cannot have a transition." });
});
