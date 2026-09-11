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
  costPerMillionTokens: {
    input: number;
    output: number;
  };
}

// Standard text pricing checked against provider documentation on 2026-09-07.
// Provider-reported cost takes precedence in server usage accounting.
const flashPricing = Date.now() < Date.parse("2027-01-01T00:00:00Z")
  ? { input: 0.75, output: 3.75 } : { input: 1.5, output: 7.5 };

export const SUPPORTED_MODELS: readonly ModelDefinition[] = [
  // --- Google Gemini ---
  {
    id: "google/gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    provider: "google",
    providerModelId: "gemini-3.6-flash",
    tier: "recommended",
    recommended: true,
    badge: "Fast",
    description: "Previous-generation Flash model for fast, cost-effective social drafting.",
    contextWindowTokens: 1_048_576,
    costPerMillionTokens: flashPricing,
  },
  {
    id: "google/gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "google",
    providerModelId: "gemini-3.8-flash",
    tier: "recommended",
    recommended: true,
    badge: "Frontier agentic",
    description: "Latest 2026 frontier agentic Flash model with enhanced reasoning and speed.",
    contextWindowTokens: 1_048_576,
    costPerMillionTokens: flashPricing,
  },
  {
    id: "google/gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    provider: "google",
    providerModelId: "gemini-3.1-pro-preview",
    tier: "frontier",
    recommended: false,
    badge: "Frontier pro",
    description: "Highest capability Google model for long-horizon planning and complex reasoning.",
    contextWindowTokens: 1_048_576,
    costPerMillionTokens: { input: 2.0, output: 12.0 },
  },

  // --- OpenAI ---
  {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    provider: "openai",
    providerModelId: "gpt-5.6-luna",
    tier: "recommended",
    recommended: true,
    badge: "High efficiency",
    description: "Production-optimized GPT-5.6 variant offering high intelligence at low cost.",
    contextWindowTokens: 1_050_000,
    costPerMillionTokens: { input: 0.2, output: 1.2 },
  },
  {
    id: "openai/gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    provider: "openai",
    providerModelId: "gpt-5.6-terra",
    tier: "standard",
    recommended: false,
    badge: "Balanced",
    description: "Balances intelligence and cost for demanding professional work.",
    contextWindowTokens: 1_050_000,
    costPerMillionTokens: { input: 2.0, output: 12.0 },
  },
  {
    id: "openai/gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "openai",
    providerModelId: "gpt-5.6-sol",
    tier: "frontier",
    recommended: false,
    badge: "Flagship reasoning",
    description: "Flagship frontier model for deep reasoning, complex instructions, and coding.",
    contextWindowTokens: 1_050_000,
    costPerMillionTokens: { input: 4.0, output: 20.0 },
  },
  {
    id: "openai/gpt-6-astra",
    name: "GPT-6 Astra",
    provider: "openai",
    providerModelId: "gpt-6-astra",
    tier: "frontier",
    recommended: false,
    badge: "Trusted access",
    description: "Highest-capability OpenAI model; availability depends on account access.",
    contextWindowTokens: 1_050_000,
    costPerMillionTokens: { input: 10.0, output: 50.0 },
  },

  // --- Anthropic ---
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    providerModelId: "claude-haiku-4-5-20251001",
    tier: "recommended",
    recommended: true,
    badge: "Fast",
    description: "Fastest Claude tier with natural conversational fluency at minimal cost.",
    contextWindowTokens: 200_000,
    costPerMillionTokens: { input: 1.0, output: 5.0 },
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    providerModelId: "claude-sonnet-4-6",
    tier: "standard",
    recommended: false,
    badge: "Creative Voice",
    description: "Exceptional nuance, tone modulation, and brand voice adherence.",
    contextWindowTokens: 1_000_000,
    costPerMillionTokens: { input: 3.0, output: 15.0 },
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    providerModelId: "claude-sonnet-5",
    tier: "frontier",
    recommended: false,
    badge: "Balanced frontier",
    description: "State-of-the-art agentic reasoning and nuanced content creation.",
    contextWindowTokens: 1_000_000,
    costPerMillionTokens: { input: 2.0, output: 10.0 },
  },
  {
    id: "anthropic/claude-opus-5",
    name: "Claude Opus 5",
    provider: "anthropic",
    providerModelId: "claude-opus-5",
    tier: "frontier",
    recommended: false,
    badge: "Deep synthesis",
    description: "Highest level of comprehension and strategic synthesis for enterprise brand strategy.",
    contextWindowTokens: 1_000_000,
    costPerMillionTokens: { input: 5.0, output: 25.0 },
  },

] as const;

export const DEFAULT_MODEL_ID = "google/gemini-3.8-flash";
export const FALLBACK_MODEL_ID = "openai/gpt-5.6-luna";

export function getModelById(id: string | null | undefined): ModelDefinition {
  if (!id) {
    return SUPPORTED_MODELS.find(model => model.id === DEFAULT_MODEL_ID)!;
  }
  // Claude 3.5 Sonnet was retired; preserve saved selections within Anthropic.
  if (id === "anthropic/claude-3-5-sonnet" || id === "claude-3-5-sonnet-latest") {
    return SUPPORTED_MODELS.find(model => model.id === "anthropic/claude-sonnet-4.6")!;
  }
  // Legacy aliases
  if (id === "google/gemini-2.5-flash" || id === "gemini-2.5-flash") {
    return SUPPORTED_MODELS.find(model => model.id === "google/gemini-3.6-flash")!;
  }
  if (["openai/gpt-4o-mini", "gpt-4o-mini"].includes(id)) {
    return SUPPORTED_MODELS.find(model => model.id === FALLBACK_MODEL_ID)!;
  }
  if (["openai/gpt-4o", "gpt-4o"].includes(id)) {
    return SUPPORTED_MODELS.find(model => model.id === "openai/gpt-5.6-terra")!;
  }

  const match = SUPPORTED_MODELS.find((m) => m.id === id);
  if (match) return match;

  // Partial match fallback by providerModelId
  const partial = SUPPORTED_MODELS.find(
    (m) => m.providerModelId === id || id.endsWith(m.providerModelId)
  );
  return partial || SUPPORTED_MODELS.find(model => model.id === DEFAULT_MODEL_ID)!;
}

/** Strict lookup for accounting paths, where silently using another model's rate is unsafe. */
export function findModelById(id: string | null | undefined): ModelDefinition | undefined {
  if (!id) return undefined;
  const normalized = id === "anthropic/claude-3-5-sonnet" || id === "claude-3-5-sonnet-latest"
    ? "anthropic/claude-sonnet-4.6"
    : id === "claude-3-5-haiku-latest"
      ? "anthropic/claude-haiku-4.5"
    : id === "google/gemini-2.5-flash" || id === "gemini-2.5-flash"
      ? "google/gemini-3.6-flash"
    : id === "openai/gpt-4o-mini" || id === "gpt-4o-mini"
      ? "openai/gpt-5.6-luna"
    : id === "openai/gpt-4o" || id === "gpt-4o"
      ? "openai/gpt-5.6-terra"
      : id;
  return SUPPORTED_MODELS.find((model) =>
    model.id === normalized
    || model.providerModelId === normalized
    || normalized === `${model.provider}/${model.providerModelId}`,
  );
}

export function getRecommendedModels(): ModelDefinition[] {
  return SUPPORTED_MODELS.filter((m) => m.recommended);
}

export function getModelsByProvider(provider: ModelProvider): ModelDefinition[] {
  return SUPPORTED_MODELS.filter((m) => m.provider === provider);
}

export function getModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = findModelById(modelId) ?? getModelById(modelId);
  const price = inputTokens > 200_000 && model.id === "google/gemini-3.1-pro"
      ? { input: 4, output: 18 } : model.costPerMillionTokens;
  const inputCost = (inputTokens / 1_000_000) * price.input;
  const outputCost = (outputTokens / 1_000_000) * price.output;
  return Number((inputCost + outputCost).toFixed(8));
}
