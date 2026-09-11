import { describe, expect, it } from "vitest";
import {
  estimateGptImage2Cost,
  estimateTextCallCost,
  getGptImage2Cost,
  getTextModelCost,
  getWhisperCost,
  requireTextModelRate,
} from "@/lib/ai-pricing";

describe("AI provider pricing", () => {
  it("uses the selected text model's input and output rates", () => {
    expect(getTextModelCost("gpt-5.6-luna", 1_000_000, 1_000_000)).toBe(1.4);
    expect(getTextModelCost("gpt-5.6-sol", 1_000_000, 1_000_000)).toBe(24);
    expect(getTextModelCost("claude-opus-5", 1_000_000, 1_000_000)).toBe(30);
  });

  it("reserves conservatively for the prompt and maximum completion", () => {
    const estimate = estimateTextCallCost("gpt-5.6-luna", [{ role: "user", content: "hello" }], 2_000);
    expect(estimate).toBeGreaterThanOrEqual(getTextModelCost("gpt-5.6-luna", 1, 2_000));
  });

  it("rejects unpriced model ids instead of charging a flat fallback", () => {
    expect(() => requireTextModelRate("unknown-provider/unknown-model")).toThrow(/No budget rate/);
  });

  it("meters GPT Image 2 token categories and quality estimates", () => {
    expect(getGptImage2Cost({ textInputTokens: 1_000, imageInputTokens: 2_000, outputTokens: 3_000 })).toBe(0.111);
    expect(estimateGptImage2Cost("a concise prompt", "1024x1024", "high"))
      .toBeGreaterThan(estimateGptImage2Cost("a concise prompt", "1024x1024", "low"));
  });

  it("meters Whisper from provider-reported duration", () => {
    expect(getWhisperCost(30)).toBe(0.003);
    expect(getWhisperCost(60)).toBe(0.006);
  });
});
