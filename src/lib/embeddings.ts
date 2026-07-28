import OpenAI from "openai";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

async function getOpenAIClient(tenantId?: string): Promise<OpenAI> {
  if (tenantId) {
    const key = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "openai")),
    });
    if (key?.encryptedKey) {
      return new OpenAI({ apiKey: decrypt(key.encryptedKey) });
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  throw new Error("No OpenAI API key available. Configure one in settings or set OPENAI_API_KEY.");
}

export async function generateEmbedding(text: string, tenantId?: string): Promise<number[]> {
  const openai = await getOpenAIClient(tenantId);
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}
