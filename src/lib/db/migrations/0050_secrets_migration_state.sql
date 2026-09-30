WITH ranked_api_keys AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, provider
      ORDER BY (status = 'active') DESC, created_at DESC, id DESC
    ) AS row_number
  FROM api_keys
)
DELETE FROM api_keys
USING ranked_api_keys
WHERE api_keys.id = ranked_api_keys.id
  AND ranked_api_keys.row_number > 1;
--> statement-breakpoint
CREATE TABLE "joey_data_migrations" (
	"id" text PRIMARY KEY NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_tenant_provider_unique_idx"
  ON "api_keys" USING btree ("tenant_id", "provider");
