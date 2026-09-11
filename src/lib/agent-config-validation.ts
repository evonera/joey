import { z } from "zod";

export const agentConfigSchema = z.object({
  brandVoice: z.string().max(20_000, "Brand voice must be 20,000 characters or fewer."),
  postingGoals: z.string().max(20_000, "Posting goals must be 20,000 characters or fewer."),
  postingSchedule: z.object({
    timezone: z.string().min(1).max(100).refine((value) => {
      try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
    }, "Choose a valid timezone.").default("UTC"),
    times: z.array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a time between 00:00 and 23:59.")).max(24).transform((values) => [...new Set(values)].sort()).default([]),
    activeDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).max(7).transform((values) => [...new Set(values)]).default([]),
    selectedAccountIds: z.array(z.string().uuid()).max(30).transform((values) => [...new Set(values)]).default([]),
  }),
});
