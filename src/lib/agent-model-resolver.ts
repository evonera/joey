import type { LanguageModel } from "ai";
import { getModelById, DEFAULT_MODEL_ID, FALLBACK_MODEL_ID, type ModelDefinition } from "@/lib/models";
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
 * Falls back through available providers when the preferred model's key is missing.
 */
export async function resolveModelForTurn(
  options: ResolveModelOptions
): Promise<ResolvedModelResult> {
  if (options.tenantId && !(await assertBudget(options.tenantId)).allowed) {
    throw new Error("Workspace monthly AI budget reached. Review usage in Settings.");
  }

  const preferredModelDef = getModelById(options.preferredModel);
  const preferredKeyInfo = await resolveProviderKeyInfo(preferredModelDef.provider, options.tenantId);

  // Happy path: preferred model's provider has a key
  if (preferredKeyInfo.key) {
    await _enforceTrialQuotaIfNeeded(options.tenantId, preferredKeyInfo);
    const model = await resolveLanguageModel(preferredModelDef, preferredKeyInfo.key);
    return { model, modelContextWindowTokens: preferredModelDef.contextWindowTokens };
  }

  // Fallback: try other providers in preference order (google → anthropic → openai)
  const fallbackOrder: Array<"google" | "anthropic" | "openai"> = ["google", "anthropic", "openai"]
    .filter((p) => p !== preferredModelDef.provider) as Array<"google" | "anthropic" | "openai">;

  for (const provider of fallbackOrder) {
    const fallbackKeyInfo = await resolveProviderKeyInfo(provider, options.tenantId);
    if (!fallbackKeyInfo.key) continue;

    // Pick best available model for this provider
    const fallbackModelId = provider === "google"
      ? DEFAULT_MODEL_ID
      : provider === "anthropic"
        ? "anthropic/claude-haiku-4.5"
        : FALLBACK_MODEL_ID;
    const fallbackModelDef = getModelById(fallbackModelId);

    console.warn(
      `[agent-model-resolver] Preferred model "${preferredModelDef.id}" (${preferredModelDef.provider}) has no API key. ` +
      `Falling back to "${fallbackModelDef.id}" (${provider}).`
    );

    await _enforceTrialQuotaIfNeeded(options.tenantId, fallbackKeyInfo);
    const model = await resolveLanguageModel(fallbackModelDef, fallbackKeyInfo.key);
    return { model, modelContextWindowTokens: fallbackModelDef.contextWindowTokens };
  }

  // No provider has a key — surface a clear, actionable error
  throw new Error(
    `No active API key found for ${preferredModelDef.name} (${preferredModelDef.provider.toUpperCase()}). ` +
    `Please add your key in Settings → AI Providers or select a different model.`
  );
}

/** Enforce the 3-attempt trial quota when using a platform (non-BYOK) key. */
async function _enforceTrialQuotaIfNeeded(
  tenantId: string | null | undefined,
  keyInfo: { isByok: boolean }
): Promise<void> {
  if (tenantId && !keyInfo.isByok) {
    const { isProTenant } = await import("@/lib/billing");
    const isPro = await isProTenant(tenantId);
    if (!isPro) {
      const { assertTrialQuota } = await import("@/lib/usage");
      await assertTrialQuota(tenantId, 3);
    }
  }
}
