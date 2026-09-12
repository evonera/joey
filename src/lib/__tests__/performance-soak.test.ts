import { describe, expect, it } from "vitest";
import { maximumEventsInWindow } from "@/lib/performance-soak";

describe("maximumEventsInWindow", () => {
  it("detects a short burst inside a long observation period", () => {
    const burst = Array.from({ length: 31 }, (_, index) => 15 * 60_000 + index * 20);
    const background = Array.from({ length: 30 }, (_, index) => index * 60_001);

    expect(maximumEventsInWindow([...background, ...burst], 60_000)).toBe(32);
  });

  it("does not combine events on opposite sides of the window boundary", () => {
    expect(maximumEventsInWindow([0, 59_999, 60_000, 119_999], 60_000)).toBe(2);
  });
});
