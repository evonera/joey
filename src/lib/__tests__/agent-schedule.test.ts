import { describe, it, expect } from "vitest";
import { computeNextDraftTime } from "../agent-schedule";

describe("computeNextDraftTime", () => {
  it("schedules strictly in the future for today if slot is upcoming", () => {
    // 2026-09-03 is a Thursday ('thu'). Suppose it is 08:00 UTC.
    const now = new Date("2026-09-03T08:00:00.000Z");
    const schedule = {
      timezone: "UTC",
      activeDays: ["thu", "fri"],
      times: ["09:00", "17:00"],
    };

    const next = computeNextDraftTime(now, schedule);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.toISOString()).toBe("2026-09-03T09:00:00.000Z");
  });

  it("advances to the second slot of the day if first has passed", () => {
    const now = new Date("2026-09-03T10:00:00.000Z");
    const schedule = {
      timezone: "UTC",
      activeDays: ["thu", "fri"],
      times: ["09:00", "17:00"],
    };

    const next = computeNextDraftTime(now, schedule);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.toISOString()).toBe("2026-09-03T17:00:00.000Z");
  });

  it("skips to the next active day if all slots today have passed", () => {
    const now = new Date("2026-09-03T18:00:00.000Z"); // Thursday evening
    const schedule = {
      timezone: "UTC",
      activeDays: ["thu", "fri"],
      times: ["09:00", "17:00"],
    };

    const next = computeNextDraftTime(now, schedule);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    // Next active day is Friday Sept 4 at 09:00 UTC
    expect(next.toISOString()).toBe("2026-09-04T09:00:00.000Z");
  });

  it("handles weekend skipping to next week active days", () => {
    const now = new Date("2026-09-04T18:00:00.000Z"); // Friday evening
    const schedule = {
      timezone: "UTC",
      activeDays: ["mon", "wed"],
      times: ["10:00"],
    };

    const next = computeNextDraftTime(now, schedule);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    // Next Monday is Sept 7
    expect(next.toISOString()).toBe("2026-09-07T10:00:00.000Z");
  });

  it("defaults to 24h fallback if schedule is empty", () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    const next = computeNextDraftTime(now, { times: [] });
    expect(next.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });
});
