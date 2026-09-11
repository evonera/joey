CREATE TABLE "agent_usage_events" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "input_tokens" bigint NOT NULL,
  "output_tokens" bigint NOT NULL,
  "cost_usd" numeric(14,8) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_usage_events_tenant_created_idx" ON "agent_usage_events" ("tenant_id", "created_at");
--> statement-breakpoint
ALTER TABLE "usage_tracking" ALTER COLUMN "estimated_cost_usd" TYPE numeric(14,8);
