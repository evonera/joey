import { describe, it, expect } from "vitest";
import { lintPackaging } from "../packaging-linter";

describe("lintPackaging", () => {
  it("returns zero score for empty title", () => {
    const result = lintPackaging("");
    expect(result.score).toBe(0);
    expect(result.charCount).toBe(0);
  });

  it("identifies hard cutoff over 100 characters", () => {
    const longTitle = "A".repeat(105);
    const result = lintPackaging(longTitle);
    const lengthIssue = result.issues.find((i) => i.type === "length");
    expect(lengthIssue).toBeDefined();
    expect(lengthIssue?.severity).toBe("critical");
  });

  it("identifies mobile cutoff and desktop cutoff", () => {
    const mediumTitle = "This is a moderately long post hook that goes beyond 60 characters easily to test truncation";
    const result = lintPackaging(mediumTitle);
    expect(result.issues.some((i) => i.type === "mobile-cut")).toBe(true);
    expect(result.issues.some((i) => i.type === "desktop-cut")).toBe(true);
  });

  it("detects shouting all-caps words", () => {
    const shouting = "WATCH THIS CRAZY AMAZING EPIC NOW";
    const result = lintPackaging(shouting);
    expect(result.issues.some((i) => i.type === "shouting")).toBe(true);
  });

  it("flags vague words", () => {
    const vague = "10 amazing things that are crazy";
    const result = lintPackaging(vague);
    expect(result.issues.some((i) => i.type === "vague")).toBe(true);
  });

  it("praises presence of numbers and questions", () => {
    const punchy = "How I made $50,000 in 30 days?";
    const result = lintPackaging(punchy);
    expect(result.good.some((g) => g.includes("concrete numbers"))).toBe(true);
    expect(result.good.some((g) => g.includes("Open question"))).toBe(true);
  });

  it("flags duplicate non-stop words between title and thumbnail", () => {
    const result = lintPackaging(
      "How to scale your SaaS revenue to 10k",
      "Scale SaaS Revenue"
    );
    const dupIssue = result.issues.find((i) => i.type === "duplicate");
    expect(dupIssue).toBeDefined();
    expect(dupIssue?.severity).toBe("critical");
  });

  it("praises complementary non-duplicate words on thumbnail", () => {
    const result = lintPackaging(
      "How I reached 100,000 subscribers in 2026",
      "SECRET FORMULA"
    );
    expect(result.issues.some((i) => i.type === "duplicate")).toBe(false);
    expect(result.good.some((g) => g.includes("complementary words"))).toBe(true);
  });

  it("flags thumbnail text exceeding 3 words", () => {
    const exactlyThree = lintPackaging("Secret growth hack", "THREE WORDS ONLY");
    expect(exactlyThree.issues.some((i) => i.type === "thumb-length")).toBe(false);
    expect(exactlyThree.good.some((g) => g.includes("ideal high-CTR"))).toBe(true);

    const fourWords = lintPackaging("Secret growth hack", "THIS IS FOUR WORDS");
    expect(fourWords.issues.some((i) => i.type === "thumb-length")).toBe(true);
  });

  it("checks exact boundary conditions for 50-char mobile and 70-char desktop cutoffs", () => {
    // 50 chars exactly - no mobile cutoff
    const exactly50 = "A".repeat(50);
    const res50 = lintPackaging(exactly50);
    expect(res50.issues.some((i) => i.type === "mobile-cut")).toBe(false);
    expect(res50.issues.some((i) => i.type === "desktop-cut")).toBe(false);

    // 51 chars - triggers mobile cutoff, but not desktop cutoff
    const exactly51 = "A".repeat(51);
    const res51 = lintPackaging(exactly51);
    expect(res51.issues.some((i) => i.type === "mobile-cut")).toBe(true);
    expect(res51.issues.some((i) => i.type === "desktop-cut")).toBe(false);

    // 70 chars exactly - triggers mobile cutoff, but not desktop cutoff
    const exactly70 = "A".repeat(70);
    const res70 = lintPackaging(exactly70);
    expect(res70.issues.some((i) => i.type === "mobile-cut")).toBe(true);
    expect(res70.issues.some((i) => i.type === "desktop-cut")).toBe(false);

    // 71 chars - triggers both mobile and desktop cutoff
    const exactly71 = "A".repeat(71);
    const res71 = lintPackaging(exactly71);
    expect(res71.issues.some((i) => i.type === "mobile-cut")).toBe(true);
    expect(res71.issues.some((i) => i.type === "desktop-cut")).toBe(true);
  });
});
