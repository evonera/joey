import { describe, expect, it } from "vitest";
import { satisfiesStableCaret } from "../../../scripts/lib/dependency-compatibility.mjs";

describe("stable core dependency compatibility", () => {
  it.each([
    ["7.0.38", "^7.0.82", false],
    ["7.0.82", "^7.0.82", true],
    ["7.1.0", "^7.0.82", true],
    ["8.0.0", "^7.0.82", false],
    ["5.9.6", "^6.1.0", false],
    ["6.2.4", "^6.1.0", true],
    ["0.5.5", "^0.5.0", true],
    ["0.6.16", "^0.5.0", false],
    ["0.0.3", "^0.0.3", true],
    ["0.0.4", "^0.0.3", false],
    ["7.0.82-beta.1", "^7.0.82", false],
    ["7.0.82", ">=7.0.82", false],
  ])("%s against %s returns %s", (version, range, expected) => {
    expect(satisfiesStableCaret(version, range)).toBe(expected);
  });
});
