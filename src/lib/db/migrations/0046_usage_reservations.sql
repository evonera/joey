ALTER TABLE "usage_tracking" ADD COLUMN "reserved_cost_usd" numeric(14,8) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_usage_events" ADD COLUMN "kind" varchar(30) DEFAULT 'text' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_usage_events" ADD COLUMN "model_id" text;
--> statement-breakpoint
ALTER TABLE "agent_usage_events" ADD COLUMN "metadata" jsonb;
--> statement-breakpoint
CREATE TABLE "usage_reservations" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "kind" varchar(30) NOT NULL,
  "model_id" text,
  "period_start" timestamp NOT NULL,
  "reserved_cost_usd" numeric(14,8) NOT NULL,
  "actual_cost_usd" numeric(14,8),
  "input_tokens" bigint DEFAULT 0 NOT NULL,
  "output_tokens" bigint DEFAULT 0 NOT NULL,
  "status" varchar(20) DEFAULT 'reserved' NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "usage_reservations_tenant_status_idx" ON "usage_reservations" ("tenant_id", "status", "created_at");
