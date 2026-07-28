-- Ensure the HNSW index on memories.embedding exists regardless of prior migration state.
-- This is a safe follow-up for environments where the original 0003 migration
-- may have failed due to index-before-table ordering.
CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops);
