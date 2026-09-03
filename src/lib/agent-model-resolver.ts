import type { LanguageModel } from "ai";
import { getModelById, type ModelDefinition } from "@/lib/models";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

export interface ResolveModelOptions {
  preferredModel?: string | null;
  tenantId?: string | null;
}

export interface ResolvedModelResult {
  model: LanguageModel;
  modelContextWindowTokens: number;
}

/**
 * Resolves the API key for a requested model provider.
 * Looks for tenant BYOK keys in Postgres first, then falls back to environment variables.
 */
export async function resolveProviderApiKey(
  provider: "google" | "openai" | "anthropic",
  tenantId?: string | null
): Promise<string | null> {
  if (tenantId) {
    const keyRow = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.tenantId, tenantId),
        eq(apiKeys.provider, provider),
        eq(apiKeys.status, "active")
      ),
    });

    if (keyRow?.encryptedKey) {
      try {
        return decrypt(keyRow.encryptedKey, tenantId);
      } catch (err) {
        console.warn(`[agent-model-resolver] Failed to decrypt ${provider} key for tenant ${tenantId}:`, err);
      }
    }
  }

  // Fallback to process environment variables
  if (provider === "google") {
    return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || null;
  }
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY || null;
  }
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY || null;
  }

  return null;
}

/**
 * Creates an instantiated AI SDK LanguageModel instance using the appropriate
 * provider credentials (BYOK first, then env).
 */
export async function resolveLanguageModel(
  modelDef: ModelDefinition,
  apiKey: string
): Promise<LanguageModel> {
  if (modelDef.provider === "google") {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelDef.providerModelId);
  }

  if (modelDef.provider === "openai") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey });
    return openai(modelDef.providerModelId);
  }

  if (modelDef.provider === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelDef.providerModelId);
  }

  throw new Error(`Unsupported model provider: ${(modelDef as any).provider}`);
}

/**
 * Main entry point for dynamic model resolution in Eve agent turns.
 */
export async function resolveModelForTurn(
  options: ResolveModelOptions
): Promise<ResolvedModelResult> {
  const modelDef = getModelById(options.preferredModel);
  const apiKey = await resolveProviderApiKey(modelDef.provider, options.tenantId);

  if (!apiKey) {
    throw new Error(
      `No active API key found for ${modelDef.name} (${modelDef.provider.toUpperCase()}). Please add your key in Settings → API Keys or select a different model.`
    );
  }

  const model = await resolveLanguageModel(modelDef, apiKey);
  return {
    model,
    modelContextWindowTokens: modelDef.contextWindowTokens,
  };
}
