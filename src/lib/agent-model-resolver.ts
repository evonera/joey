import type { LanguageModel } from "ai";
import { getModelById, type ModelDefinition } from "@/lib/models";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { assertBudget } from "@/lib/usage";
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
 * Resolves the API key for a requested model provider along with source metadata (BYOK vs platform).
 */
export async function resolveProviderKeyInfo(
  provider: "google" | "openai" | "anthropic",
  tenantId?: string | null
): Promise<{ key: string | null; isByok: boolean }> {
  if (tenantId) {
    const keyRow = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.tenantId, tenantId),
        eq(apiKeys.provider, provider)
      ),
    });

    if (keyRow && keyRow.status !== "active") throw new Error(`The ${provider} key for this workspace is disabled. Update it in Settings → AI Providers.`);
    if (keyRow?.encryptedKey) {
      try {
        return { key: decrypt(keyRow.encryptedKey, tenantId), isByok: true };
      } catch (err) {
        console.warn(`[agent-model-resolver] Failed to decrypt ${provider} key for tenant ${tenantId}:`, err);
        throw new Error(`The ${provider} key could not be read. Save it again in Settings → AI Providers.`);
      }
    }
  }

  // Fallback to process environment variables
  let envKey: string | null = null;
  if (provider === "google") {
    envKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || null;
  } else if (provider === "openai") {
    envKey = process.env.OPENAI_API_KEY || null;
  } else if (provider === "anthropic") {
    envKey = process.env.ANTHROPIC_API_KEY || null;
  }

  return { key: envKey, isByok: false };
}

/**
 * Resolves the API key for a requested model provider.
 * Looks for tenant BYOK keys in Postgres first, then falls back to environment variables.
 */
export async function resolveProviderApiKey(
  provider: "google" | "openai" | "anthropic",
  tenantId?: string | null
): Promise<string | null> {
  const info = await resolveProviderKeyInfo(provider, tenantId);
  return info.key;
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
  if (options.tenantId && !(await assertBudget(options.tenantId)).allowed) {
    throw new Error("Workspace monthly AI budget reached. Review usage in Settings.");
  }
  const modelDef = getModelById(options.preferredModel);
  const keyInfo = await resolveProviderKeyInfo(modelDef.provider, options.tenantId);

  if (!keyInfo.key) {
    throw new Error(
      `No active API key found for ${modelDef.name} (${modelDef.provider.toUpperCase()}). Please add your key in Settings → AI Providers or select a different model.`
    );
  }

  // If using platform fallback key and workspace is on free tier without an active subscription,
  // enforce the 3-attempt trial limit.
  if (options.tenantId && !keyInfo.isByok) {
    const { isProTenant } = await import("@/lib/billing");
    const isPro = await isProTenant(options.tenantId);
    if (!isPro) {
      const { assertTrialQuota } = await import("@/lib/usage");
      await assertTrialQuota(options.tenantId, 3);
    }
  }

  const model = await resolveLanguageModel(modelDef, keyInfo.key);
  return {
    model,
    modelContextWindowTokens: modelDef.contextWindowTokens,
  };
}
