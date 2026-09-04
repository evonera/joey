import { db } from "@/lib/db";
import { memories } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { assertEmbeddingDimensions, generateEmbedding, hasOpenAIKey } from "@/lib/embeddings";
import { redactPII } from "@/lib/redact-pii";

export type MemoryType = "published_post" | "strategy_insight" | "brand_guideline";

/** Upper bound for persisted memory content (~1500 tokens). */
export const MEMORY_MAX_CHARS = 6000;

type InsertClient = Pick<typeof db, "insert">;

/**
 * Single choke point for memory content: trims, redacts PII, and truncates.
 * Rejects empty input so blank/whitespace memories can never 400 the
 * embedding call or pollute the vector index.
 */
export function prepareMemoryContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Cannot store empty memory.");
  }
  return redactPII(trimmed).slice(0, MEMORY_MAX_CHARS);
}

export async function insertMemory(
  tenantId: string,
  content: string,
  type: MemoryType,
  metadata?: Record<string, unknown>,
) {
  const prepared = prepareMemoryContent(content);
  let embedding: number[];
  const canEmbed = await hasOpenAIKey(tenantId);
  if (canEmbed) {
    try {
      embedding = await generateEmbedding(prepared, tenantId);
    } catch (err) {
      console.warn("[memories] Embedding generation failed, falling back to zero-vector:", err);
      embedding = new Array(1536).fill(0);
    }
  } else {
    embedding = new Array(1536).fill(0);
  }
  return insertMemoryWithEmbedding(tenantId, prepared, type, metadata, embedding);
}

/**
 * Persists a memory for a precomputed embedding. Accepts a transaction client
 * so callers can swap memories atomically (delete-then-insert) without
 * holding a lock during the embedding network call.
 */
export async function insertMemoryWithEmbedding(
  tenantId: string,
  content: string,
  type: MemoryType,
  metadata: Record<string, unknown> | undefined,
  embedding: number[],
  client: InsertClient = db,
) {
  assertEmbeddingDimensions(embedding);
  const [memory] = await client.insert(memories).values({
    tenantId,
    content,
    type,
    metadata: metadata ?? {},
    embedding: sql`${JSON.stringify(embedding)}::vector`,
  }).returning();
  return memory;
}

export type MemoryResult = {
  id: string;
  tenantId: string;
  content: string;
  type: string;
  metadata: unknown;
  createdAt: Date;
  similarity: number;
};

export async function searchMemories(
  tenantId: string,
  query: string,
  limit: number = 5,
  type?: MemoryType,
): Promise<MemoryResult[]> {
  const canEmbed = await hasOpenAIKey(tenantId);
  if (canEmbed) {
    try {
      const embedding = await generateEmbedding(query, tenantId);
      const embeddingStr = `[${embedding.join(",")}]`;

      const conditions = [sql`${memories.tenantId} = ${tenantId}`];
      if (type) {
        conditions.push(sql`${memories.type} = ${type}`);
      }

      const results = await db.execute(
        sql`
          SELECT
            id, tenant_id, content, type, metadata, created_at,
            1 - (embedding <=> ${embeddingStr}::vector) AS similarity
          FROM ${memories}
          WHERE ${sql.join(conditions, sql` AND `)}
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT ${limit}
        `,
      );

      const rawRows = (results as any).rows ?? results;
      return rawRows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        content: row.content,
        type: row.type,
        metadata: row.metadata,
        createdAt: new Date(row.created_at),
        similarity: Number(row.similarity),
      }));
    } catch (err) {
      console.warn("[memories] Vector similarity search failed, falling back to text match:", err);
    }
  }

  // Graceful fallback to text keyword search when OpenAI embedding is not available
  const conditions = [sql`${memories.tenantId} = ${tenantId}`];
  if (type) {
    conditions.push(sql`${memories.type} = ${type}`);
  }

  const cleanQuery = query.trim();
  if (cleanQuery) {
    const terms = cleanQuery
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, ""))
      .filter((w) => w.length > 2)
      .slice(0, 5);

    if (terms.length > 0) {
      const termConditions = terms.map((t) => sql`${memories.content} ILIKE ${"%" + t + "%"}`);
      conditions.push(sql`(${sql.join(termConditions, sql` OR `)})`);
    }
  }

  try {
    const results = await db.execute(
      sql`
        SELECT
          id, tenant_id, content, type, metadata, created_at,
          0.5 AS similarity
        FROM ${memories}
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `,
    );

    const rawRows = (results as any).rows ?? results;
    return (rawRows || []).map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      content: row.content,
      type: row.type,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      similarity: 0.5,
    }));
  } catch (err) {
    console.error("[memories] Text fallback search failed:", err);
    return [];
  }
}
