'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface ConfiguredProvidersResult {
  configuredProviders: string[];
  hasEnvKeys: {
    google: boolean;
    openai: boolean;
    anthropic: boolean;
  };
}

export async function getConfiguredProviders(): Promise<ConfiguredProvidersResult> {
  try {
    const tenantId = await getActiveTenantId();
    const rows = await db.query.apiKeys.findMany({
      where: and(
        eq(apiKeys.tenantId, tenantId),
        eq(apiKeys.status, "active")
      ),
      columns: { provider: true },
    });

    const configuredProviders = Array.from(new Set(rows.map((r) => r.provider)));
    const hasEnvKeys = {
      google: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    };

    return { configuredProviders, hasEnvKeys };
  } catch {
    return {
      configuredProviders: [],
      hasEnvKeys: {
        google: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      },
    };
  }
}
