import { describe, expect, it } from "vitest";
import {
  SUPPORTED_MODELS,
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  getModelById,
  getRecommendedModels,
  getModelsByProvider,
} from "@/lib/models";

describe("models catalog", () => {
  it("defines supported models with valid attributes", () => {
    expect(SUPPORTED_MODELS.length).toBeGreaterThan(5);
    for (const m of SUPPORTED_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(["google", "openai", "anthropic"]).toContain(m.provider);
      expect(["recommended", "standard", "frontier"]).toContain(m.tier);
      expect(typeof m.recommended).toBe("boolean");
      expect(m.contextWindowTokens).toBeGreaterThan(0);
    }
  });

  it("filters recommended cheap workhorse models", () => {
    const recommended = getRecommendedModels();
    expect(recommended.length).toBeGreaterThan(0);
    expect(recommended.every((m) => m.recommended)).toBe(true);

    const ids = recommended.map((m) => m.id);
    expect(ids).toContain("google/gemini-2.5-flash");
    expect(ids).toContain("openai/gpt-4o-mini");
    expect(ids).toContain("anthropic/claude-haiku-4.5");
  });

  it("retrieves models by id and falls back gracefully", () => {
    expect(getModelById("google/gemini-2.5-flash").id).toBe("google/gemini-2.5-flash");
    expect(getModelById("openai/gpt-5.6-luna").id).toBe("openai/gpt-5.6-luna");
    expect(getModelById("gemini-2.5-flash").id).toBe("google/gemini-2.5-flash");

    // Unknown or empty ID falls back to default
    expect(getModelById("unknown-model-xyz").id).toBe(DEFAULT_MODEL_ID);
    expect(getModelById(null).id).toBe(DEFAULT_MODEL_ID);
  });

  it("filters models by provider", () => {
    const googleModels = getModelsByProvider("google");
    expect(googleModels.every((m) => m.provider === "google")).toBe(true);
    expect(googleModels.some((m) => m.id === "google/gemini-2.5-flash")).toBe(true);

    const openaiModels = getModelsByProvider("openai");
    expect(openaiModels.every((m) => m.provider === "openai")).toBe(true);
    expect(openaiModels.some((m) => m.id === "openai/gpt-4o-mini")).toBe(true);

    const anthropicModels = getModelsByProvider("anthropic");
    expect(anthropicModels.every((m) => m.provider === "anthropic")).toBe(true);
    expect(anthropicModels.some((m) => m.id === "anthropic/claude-haiku-4.5")).toBe(true);
  });
});
