import { z } from "zod";

export const editorialPreferencesSchema = z.object({
  timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Choose an IANA timezone."),
  spacingMinutes: z.number().int().min(30).max(1440).default(360),
  windows: z.array(z.object({ day: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).strict().refine(w => w.endMinute > w.startMinute, "Posting windows must end on the same day after their start.")).min(1).max(21),
}).strict();
export type EditorialPreferences = z.infer<typeof editorialPreferencesSchema>;

export function isEditorialWindow(preferences: EditorialPreferences, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: preferences.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (key: string) => parts.find(p => p.type === key)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
  const minute = Number(part("hour")) * 60 + Number(part("minute"));
  return preferences.windows.some(w => w.day === day && minute >= w.startMinute && minute < w.endMinute);
}

export function conflictsWithSlot(candidate: Date, occupied: Date[], spacingMinutes: number) {
  return occupied.some(time => Math.abs(candidate.getTime() - time.getTime()) < spacingMinutes * 60_000);
}

/** Iterate UTC instants rather than constructing local dates: DST gaps cannot
 * create nonexistent times, and repeated local times retain distinct offsets. */
export function suggestEditorialSlots(preferences: EditorialPreferences, occupied: Date[], now = new Date()) {
  const prefs = editorialPreferencesSchema.parse(preferences);
  const result: Array<{ utc: string; local: string; explanation: string }> = [];
  const step = 15 * 60_000;
  const end = now.getTime() + 14 * 86_400_000;
  for (let instant = Math.ceil((now.getTime() + 1) / step) * step; instant <= end && result.length < 3; instant += step) {
    const date = new Date(instant);
    if (!isEditorialWindow(prefs, date)) continue;
    if (conflictsWithSlot(date, [...occupied, ...result.map(r => new Date(r.utc))], prefs.spacingMinutes)) continue;
    result.push({ utc: date.toISOString(), local: new Intl.DateTimeFormat("en", { timeZone: prefs.timezone, dateStyle: "medium", timeStyle: "long" }).format(date), explanation: `Within your ${prefs.timezone} posting windows, with at least ${prefs.spacingMinutes} minutes between account posts. Not an engagement prediction.` });
  }
  return result;
}
