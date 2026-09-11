CREATE TABLE media_render_jobs (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 input_hash text NOT NULL,
 spec jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','rendering','succeeded','failed','cancelled')),
 attempt integer NOT NULL DEFAULT 0,
 attempt_token text,
 output_asset_id text REFERENCES assets(id) ON DELETE SET NULL,
 error text,
 usage jsonb,
 created_at timestamp NOT NULL DEFAULT now(),
 updated_at timestamp NOT NULL DEFAULT now(),
 UNIQUE (tenant_id, input_hash)
);
CREATE INDEX media_render_jobs_queue_idx ON media_render_jobs(status, updated_at);
