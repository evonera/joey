import { describe, expect, it } from "vitest";
import { conflictsWithSlot, editorialPreferencesSchema, suggestEditorialSlots } from "../editorial-calendar";
const allDay = Array.from({ length: 7 }, (_, day) => ({ day, startMinute: 0, endMinute: 1440 }));
describe("Account editorial suggestions", () => {
  it("bounds inputs and rejects unsupported timezones/overnight windows", () => {
    expect(editorialPreferencesSchema.safeParse({ timezone: "not/a-zone", windows: allDay }).success).toBe(false);
    expect(editorialPreferencesSchema.safeParse({ timezone: "UTC", windows: [{ day: 1, startMinute: 900, endMinute: 500 }] }).success).toBe(false);
  });
  it("returns three future account slots with conservative configurable spacing", () => {
    const now = new Date("2026-10-04T10:00:00Z");
    const slots = suggestEditorialSlots({ timezone: "Asia/Kolkata", windows: allDay, spacingMinutes: 360 }, [new Date("2026-10-04T11:00:00Z")], now);
    expect(slots).toHaveLength(3);
    expect(slots[0].utc).toBe("2026-10-04T17:00:00.000Z");
    expect(slots[0].explanation).toContain("Not an engagement prediction");
    expect(conflictsWithSlot(new Date(slots[1].utc), [new Date(slots[0].utc)], 360)).toBe(false);
  });
  it("skips nonexistent spring-forward times and preserves UTC identity in fall-back", () => {
    const spring = suggestEditorialSlots({ timezone: "America/New_York", windows: [{ day: 0, startMinute: 120, endMinute: 180 }], spacingMinutes: 30 }, [], new Date("2026-03-08T05:00:00Z"));
    expect(spring[0].utc).toContain("2026-03-15");
    const fall = suggestEditorialSlots({ timezone: "America/New_York", windows: [{ day: 0, startMinute: 60, endMinute: 120 }], spacingMinutes: 60 }, [], new Date("2026-11-01T04:59:00Z"));
    expect(fall.slice(0, 2).map(s => s.utc)).toEqual(["2026-11-01T05:00:00.000Z", "2026-11-01T06:00:00.000Z"]);
  });
});
