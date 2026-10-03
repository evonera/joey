import { describe, expect, it } from "vitest";
import { maximumTrimDuration, trimError } from "../trim";

describe("source trim bounds", () => {
  it("preserves fractional duration and accounts for nonzero start", () => {
    expect(maximumTrimDuration(1.2, 3.6)).toBeCloseTo(2.4);
    expect(trimError(0, 3.6, 3.6)).toBeNull();
    expect(trimError(0, 4, 3.6)).not.toBeNull();
    expect(trimError(1.2, 3, 3.6)).not.toBeNull();
    expect(trimError(1.1, 1.2, 2.3)).toBeNull();
    expect(trimError(.1, 3.2, 3.3)).toBeNull();
    expect(trimError(0, 3.60001, 3.6)).not.toBeNull();
  });
  it("caps long sources and rejects short remaining ranges", () => {
    expect(maximumTrimDuration(0, 120)).toBe(60);
    expect(trimError(2.8, 1, 3.6)).not.toBeNull();
    expect(trimError(0, 61, 120)).not.toBeNull();
  });
  it("rejects nonfinite metadata and permits unknown metadata only provisionally", () => {
    for (const value of [NaN, Infinity, -1]) {
      expect(trimError(value, 2, null)).not.toBeNull();
      expect(trimError(0, value, null)).not.toBeNull();
      expect(trimError(0, 2, value)).not.toBeNull();
    }
    expect(trimError(0, 15, null)).toBeNull();
  });
});
