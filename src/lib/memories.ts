import { db } from "@/lib/db";
import { memories } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embeddings";

export type MemoryType = "published_post" | "strategy_insight" | "brand_guideline";

export async function insertMemory(
  tenantId: string,
  content: string,
  type: MemoryType,
  metadata?: Record<string, unknown>,
) {
  const embedding = await generateEmbedding(content, tenantId);
  const [memory] = await db.insert(memories).values({
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
}
