-- Compact pre-existing duplicate brand guidelines (keep newest per tenant)
-- so the one-per-tenant unique index below builds without failure.
DELETE FROM "memories" AS dup USING "memories" AS keeper
WHERE dup."type" = 'brand_guideline'
  AND keeper."type" = 'brand_guideline'
  AND dup."tenant_id" = keeper."tenant_id"
  AND (dup."created_at", dup."id") < (keeper."created_at", keeper."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "memories_one_brand_guideline_per_tenant_idx" ON "memories" USING btree ("tenant_id") WHERE type = 'brand_guideline';
