import { findModelById, getModelCost } from "@/lib/models";

export const WHISPER_USD_PER_MINUTE = 0.006;

const EXTRA_TEXT_RATES: Record<string, { input: number; output: number }> = {
  // Built-in OpenRouter flow template; verified against the model page.
  "meta-llama/llama-3.3-70b-instruct": { input: 0.1, output: 0.32 },
};

export function estimateTextTokens(value: unknown): number {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  // A conservative admission estimate. Provider counters replace it at settlement.
  return Math.max(1, Math.ceil((serialized?.length ?? 0) / 3));
}

export function requireTextModelRate(modelId: string) {
  if (EXTRA_TEXT_RATES[modelId]) return { providerModelId: modelId, costPerMillionTokens: EXTRA_TEXT_RATES[modelId] };
  const model = findModelById(modelId);
  if (!model) throw new Error(`No budget rate is configured for model "${modelId}".`);
  return model;
}

export function getTextModelCost(modelId: string, inputTokens: number, outputTokens: number) {
  const extra = EXTRA_TEXT_RATES[modelId];
  if (extra) return Number((inputTokens * extra.input / 1_000_000 + outputTokens * extra.output / 1_000_000).toFixed(8));
  requireTextModelRate(modelId);
  return getModelCost(modelId, inputTokens, outputTokens);
}

export function estimateTextCallCost(modelId: string, input: unknown, maxOutputTokens: number): number {
  requireTextModelRate(modelId);
  return getTextModelCost(modelId, estimateTextTokens(input), maxOutputTokens);
}

const IMAGE_OUTPUT_COST_USD = {
  low: { "1024x1024": 0.006, "1024x1536": 0.005, "1536x1024": 0.005 },
  medium: { "1024x1024": 0.053, "1024x1536": 0.041, "1536x1024": 0.041 },
  high: { "1024x1024": 0.211, "1024x1536": 0.165, "1536x1024": 0.165 },
} as const;

export type ImageQuality = keyof typeof IMAGE_OUTPUT_COST_USD;
export type ImageSize = keyof (typeof IMAGE_OUTPUT_COST_USD)[ImageQuality];

/** GPT Image 2: $5/M text input, $8/M image input, $30/M image output. */
export function getGptImage2Cost(input: {
  textInputTokens: number;
  imageInputTokens?: number;
  outputTokens: number;
}) {
  return Number((
    input.textInputTokens * 5 / 1_000_000
    + (input.imageInputTokens ?? 0) * 8 / 1_000_000
    + input.outputTokens * 30 / 1_000_000
  ).toFixed(8));
}

export function estimateGptImage2Cost(prompt: string, size: ImageSize, quality: ImageQuality) {
  const textCost = estimateTextTokens(prompt) * 5 / 1_000_000;
  return Number((textCost + IMAGE_OUTPUT_COST_USD[quality][size]).toFixed(8));
}

export function getWhisperCost(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) throw new Error("Invalid transcription duration.");
  return Number((durationSeconds / 60 * WHISPER_USD_PER_MINUTE).toFixed(8));
}
