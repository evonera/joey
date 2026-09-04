export type ModelProvider = "google" | "openai" | "anthropic";

export type ModelTier = "recommended" | "standard" | "frontier";

export interface ModelDefinition {
  id: string;
  name: string;
  provider: ModelProvider;
  providerModelId: string;
  tier: ModelTier;
  recommended: boolean;
  badge: string;
  description: string;
  contextWindowTokens: number;
}

export const SUPPORTED_MODELS: readonly ModelDefinition[] = [
  // --- Google Gemini ---
  {
    id: "google/gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    provider: "google",
    providerModelId: "gemini-3.6-flash",
    tier: "recommended",
    recommended: true,
    badge: "⚡ Fast",
    description: "Latest high-speed, cost-effective Gemini model for social drafting.",
    contextWindowTokens: 1_048_576,
  },
  {
    id: "google/gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "google",
    providerModelId: "gemini-3.8-flash",
    tier: "recommended",
    recommended: true,
    badge: "⚡ Frontier Agentic",
    description: "Latest 2026 frontier agentic Flash model with enhanced reasoning and speed.",
    contextWindowTokens: 1_048_576,
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    providerModelId: "gemini-2.5-pro",
    tier: "frontier",
    recommended: false,
    badge: "🧠 Deep Reasoning",
    description: "Complex creative thinking, deep content critique, and multi-modal synthesis.",
    contextWindowTokens: 2_097_152,
  },
  {
    id: "google/gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    provider: "google",
    providerModelId: "gemini-3.1-pro",
    tier: "frontier",
    recommended: false,
    badge: "🧠 Frontier Pro",
    description: "Highest capability Google model for long-horizon planning and complex reasoning.",
    contextWindowTokens: 2_097_152,
  },

  // --- OpenAI ---
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    providerModelId: "gpt-4o-mini",
    tier: "recommended",
    recommended: true,
    badge: "⚡ Fast",
    description: "Lightweight and reliable for day-to-day social media tasks and fast chat turns.",
    contextWindowTokens: 128_000,
  },
  {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    provider: "openai",
    providerModelId: "gpt-5.6-luna",
    tier: "recommended",
    recommended: true,
    badge: "⚡ High Efficiency",
    description: "Production-optimized GPT-5.6 variant offering high intelligence at low cost.",
    contextWindowTokens: 128_000,
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    providerModelId: "gpt-4o",
    tier: "standard",
    recommended: false,
    badge: "Versatile Standard",
    description: "Standard multimodal workhorse model with strong text and image understanding.",
    contextWindowTokens: 128_000,
  },
  {
    id: "openai/gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "openai",
    providerModelId: "gpt-5.6-sol",
    tier: "frontier",
    recommended: false,
    badge: "🧠 Flagship Reasoning",
    description: "Flagship frontier model for deep reasoning, complex instructions, and coding.",
    contextWindowTokens: 200_000,
  },

  // --- Anthropic ---
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    providerModelId: "claude-haiku-4-5",
    tier: "recommended",
    recommended: true,
    badge: "⚡ Fast",
    description: "Fastest Claude tier with natural conversational fluency at minimal cost.",
    contextWindowTokens: 200_000,
  },
  {
    id: "anthropic/claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    providerModelId: "claude-3-5-sonnet-latest",
    tier: "standard",
    recommended: false,
    badge: "Creative Voice",
    description: "Exceptional nuance, tone modulation, and brand voice adherence.",
    contextWindowTokens: 200_000,
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    providerModelId: "claude-sonnet-5",
    tier: "frontier",
    recommended: false,
    badge: "🧠 Balanced Frontier",
    description: "State-of-the-art agentic reasoning and nuanced content creation.",
    contextWindowTokens: 200_000,
  },
  {
    id: "anthropic/claude-opus-5",
    name: "Claude Opus 5",
    provider: "anthropic",
    providerModelId: "claude-opus-5",
    tier: "frontier",
    recommended: false,
    badge: "🧠 Deep Synthesis",
    description: "Highest level of comprehension and strategic synthesis for enterprise brand strategy.",
    contextWindowTokens: 200_000,
  },
] as const;

export const DEFAULT_MODEL_ID = "google/gemini-3.6-flash";
export const FALLBACK_MODEL_ID = "openai/gpt-4o-mini";

export function getModelById(id: string | null | undefined): ModelDefinition {
  if (!id) {
    return SUPPORTED_MODELS[0];
  }
  // Legacy aliases
  if (id === "google/gemini-2.5-flash" || id === "gemini-2.5-flash") {
    return SUPPORTED_MODELS[0];
  }

  const match = SUPPORTED_MODELS.find((m) => m.id === id);
  if (match) return match;

  // Partial match fallback by providerModelId
  const partial = SUPPORTED_MODELS.find(
    (m) => m.providerModelId === id || id.endsWith(m.providerModelId)
  );
  return partial || SUPPORTED_MODELS[0];
}

export function getRecommendedModels(): ModelDefinition[] {
  return SUPPORTED_MODELS.filter((m) => m.recommended);
}

export function getModelsByProvider(provider: ModelProvider): ModelDefinition[] {
  return SUPPORTED_MODELS.filter((m) => m.provider === provider);
}
