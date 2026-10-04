CREATE TABLE "editorial_preferences" (
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" text NOT NULL,
  "preferences" jsonb NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("tenant_id", "account_id") REFERENCES "social_accounts"("tenant_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_preferences_identity" ON "editorial_preferences" ("tenant_id", "account_id");
