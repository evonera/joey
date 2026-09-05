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

async function searchTextMemories(
  tenantId: string,
  cleanQuery: string,
  limit: number,
  type?: MemoryType,
): Promise<MemoryResult[]> {
  const conditions = [sql`${memories.tenantId} = ${tenantId}`];
  if (type) {
    conditions.push(sql`${memories.type} = ${type}`);
  }

  if (cleanQuery) {
    const rawTerms = cleanQuery
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, ""))
      .filter(Boolean);

    // Prefer terms longer than 2 characters, but fall back to shorter terms if all terms are short (e.g. "AI", "X")
    const terms = (
      rawTerms.filter((w) => w.length > 2).length > 0
        ? rawTerms.filter((w) => w.length > 2)
        : rawTerms
    ).slice(0, 5);

    if (terms.length > 0) {
      const termConditions = terms.map((t) => sql`${memories.content} ILIKE ${"%" + t + "%"}`);
      conditions.push(sql`(${sql.join(termConditions, sql` OR `)})`);
    } else {
      // Query contained only symbols/punctuation with no searchable alphanumeric terms
      return [];
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
    console.error("[memories] Text search failed:", err);
    return [];
  }
}

export async function searchMemories(
  tenantId: string,
  query: string,
  limit: number = 5,
  type?: MemoryType,
): Promise<MemoryResult[]> {
  const cleanQuery = query.trim();
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
      const vectorResults: MemoryResult[] = (rawRows || []).map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        content: row.content,
        type: row.type,
        metadata: row.metadata,
        createdAt: new Date(row.created_at),
        similarity: Number(row.similarity),
      }));

      // Backfill any returned vector rows that have zero vectors / invalid similarity
      for (const row of vectorResults) {
        if (!Number.isFinite(row.similarity) || row.similarity <= 0) {
          void generateEmbedding(row.content, tenantId)
            .then(async (newEmb) => {
              await db.update(memories)
                .set({ embedding: sql`${JSON.stringify(newEmb)}::vector` })
                .where(eq(memories.id, row.id));
            })
            .catch(() => {});
        }
      }

      // Also rescue keyword-matching memories that may have zero vectors and missed vector ranking
      if (cleanQuery) {
        const textMatches = await searchTextMemories(tenantId, cleanQuery, limit, type);
        for (const item of textMatches) {
          const existing = vectorResults.find((r) => r.id === item.id);
          if (!existing) {
            // If vector results have room or contain zero-vector/low-similarity entries, promote the text match
            const lowQualityIdx = vectorResults.findIndex(
              (r) => !Number.isFinite(r.similarity) || r.similarity < 0.3
            );
            if (lowQualityIdx >= 0) {
              vectorResults[lowQualityIdx] = item;
            } else if (vectorResults.length < limit) {
              vectorResults.push(item);
            }
            // Schedule embedding backfill for the rescued item
            void generateEmbedding(item.content, tenantId)
              .then(async (newEmb) => {
                await db.update(memories)
                  .set({ embedding: sql`${JSON.stringify(newEmb)}::vector` })
                  .where(eq(memories.id, item.id));
              })
              .catch(() => {});
          } else if (!Number.isFinite(existing.similarity) || existing.similarity <= 0) {
            // Was returned by vector search but with a zero vector; upgrade its similarity and backfill
            existing.similarity = 0.5;
            void generateEmbedding(existing.content, tenantId)
              .then(async (newEmb) => {
                await db.update(memories)
                  .set({ embedding: sql`${JSON.stringify(newEmb)}::vector` })
                  .where(eq(memories.id, existing.id));
              })
              .catch(() => {});
          }
        }
      }

      return vectorResults.slice(0, limit);
    } catch (err) {
      console.warn("[memories] Vector similarity search failed, falling back to text match:", err);
    }
  }

  // Graceful fallback to text keyword search when OpenAI embedding is not available
  return searchTextMemories(tenantId, cleanQuery, limit, type);
}
