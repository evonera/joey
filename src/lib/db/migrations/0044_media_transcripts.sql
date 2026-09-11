CREATE TABLE media_transcripts (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 input_hash text NOT NULL,
 status text NOT NULL CHECK (status IN ('processing','succeeded','failed')),
 attempt_token text NOT NULL,
 words jsonb,
 duration_seconds double precision,
 error text,
 created_at timestamp NOT NULL DEFAULT now(),
 updated_at timestamp NOT NULL DEFAULT now(),
 UNIQUE (tenant_id, input_hash)
);
