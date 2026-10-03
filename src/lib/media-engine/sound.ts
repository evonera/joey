import { z } from "zod";
export const soundCueSchema = z.object({ effect: z.enum(["whoosh", "pop", "ding"]), frame: z.number().int().min(0).max(1799), gain: z.number().min(.01).max(.35).default(.2) }).strict();
export const soundCuesSchema = z.array(soundCueSchema).max(6).superRefine((cues, ctx) => {
  let previous = -30;
  for (const cue of cues) {
    if (cue.frame - previous < 30) ctx.addIssue({ code: "custom", message: "Sound cues must be ordered and at least one second apart." });
    previous = cue.frame;
  }
});
export type SoundCue = z.infer<typeof soundCueSchema>;
