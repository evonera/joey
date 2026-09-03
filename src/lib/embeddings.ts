import OpenAI from "openai";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
/** ~1500 tokens; well under the 8192-token input limit. */
export const EMBEDDING_MAX_CHARS = 6000;

export function assertEmbeddingDimensions(embedding: unknown): asserts embedding is number[] {
  if (
    !Array.isArray(embedding) ||
    embedding.length !== EMBEDDING_DIMENSIONS ||
    embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(`Embedding must be a finite ${EMBEDDING_DIMENSIONS}-dimensional vector.`);
  }
}

async function getOpenAIClient(tenantId?: string): Promise<OpenAI> {
  if (tenantId) {
    const tenantKey = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.tenantId, tenantId),
        eq(apiKeys.provider, "openai"),
      ),
    });
    if (tenantKey) {
      if (tenantKey.status !== "active") {
        throw new Error("OpenAI API key for this workspace is revoked or disabled.");
      }
      return new OpenAI({ apiKey: decrypt(tenantKey.encryptedKey, tenantId) });
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  throw new Error("No OpenAI API key available. Configure one in settings or set OPENAI_API_KEY.");
}

export async function generateEmbedding(text: string, tenantId?: string): Promise<number[]> {
  const input = text.trim().slice(0, EMBEDDING_MAX_CHARS);
  if (!input) {
    throw new Error("Cannot embed empty text.");
  }
  const openai = await getOpenAIClient(tenantId);
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });
  try {
    if (tenantId && response.usage?.prompt_tokens) {
      const { recordTokenUsage } = await import("@/lib/usage");
      await recordTokenUsage(tenantId, response.usage.prompt_tokens, 0);
    }
  } catch (err) {
    console.error("Failed to record embedding usage:", err);
  }
  const embedding = response.data[0]?.embedding;
  assertEmbeddingDimensions(embedding);
  return embedding;
}
