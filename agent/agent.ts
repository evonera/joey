import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-4o-mini",
  compaction: {
    thresholdPercent: 0.9,
  },
  limits: {
    maxInputTokensPerSession: 40_000_000,
  },
  build: {
    externalDependencies: ["@resvg/resvg-js"],
  },
});
