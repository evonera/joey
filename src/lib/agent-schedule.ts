import { toZonedTime, fromZonedTime } from "date-fns-tz";

const DAY_INDEX: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
};

export interface PostingSchedule {
  timezone?: string;
  times?: string[];
  activeDays?: string[];
  selectedAccountIds?: string[];
}

function parseTime(t: string): { hours: number; minutes: number } {
  const [hours, minutes] = t.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

/**
 * Computes the next future drafting time (as an absolute UTC Date) honouring the
 * tenant's configured timezone and active days. If the schedule has no times or
 * activeDays, it defaults to a 24-hour poke so polling keeps working.
 */
export function computeNextDraftTime(now: Date, schedule?: PostingSchedule | null): Date {
  const timezone = schedule?.timezone || "UTC";
  const times = (schedule?.times || []).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
  const activeDays = schedule?.activeDays || [];

  if (times.length === 0) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  let nowZoned: Date;
  try {
    nowZoned = toZonedTime(now, timezone);
  } catch {
    nowZoned = toZonedTime(now, "UTC");
  }

  // Scan up to 14 days forward for the next valid slot.
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const day = new Date(nowZoned.getFullYear(), nowZoned.getMonth(), nowZoned.getDate() + dayOffset);
    const dow = day.getDay();
    if (activeDays.length > 0 && !activeDays.includes(Object.keys(DAY_INDEX).find((k) => DAY_INDEX[k] === dow) as string)) {
      continue;
    }
    const sorted = [...times].sort();
    for (const t of sorted) {
      const { hours, minutes } = parseTime(t);
      const candidateLocal = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
      // Candidate must be strictly in the future in the tenant's local time.
      if (candidateLocal.getTime() > nowZoned.getTime()) {
        try {
          return fromZonedTime(candidateLocal, timezone);
        } catch {
          return fromZonedTime(candidateLocal, "UTC");
        }
      }
    }
  }

  // Fallback: 24h rolling cadence.
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
