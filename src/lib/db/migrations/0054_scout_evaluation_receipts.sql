CREATE TABLE "scout_evaluations" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scout_id" text NOT NULL,
  "config_key" text NOT NULL,
  "event_key" text NOT NULL,
  "operation_id" text NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "phase" varchar(24) NOT NULL DEFAULT 'preparing',
  "lease_token" text,
  "lease_expires_at" timestamp,
  "items" jsonb,
  "result" jsonb,
  "dispatch_attempts" integer NOT NULL DEFAULT 0,
  "dispatch_lease_until" timestamp,
  "next_dispatch_at" timestamp NOT NULL DEFAULT now(),
  "error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("tenant_id", "scout_id") REFERENCES "scouts"("tenant_id", "id") ON DELETE CASCADE,
  CHECK ("dispatch_attempts" BETWEEN 0 AND 3),
  CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'uncertain'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scout_evaluations_event_key" ON "scout_evaluations" ("tenant_id", "scout_id", "config_key", "event_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "scout_evaluations_operation_id" ON "scout_evaluations" ("operation_id");
--> statement-breakpoint
CREATE INDEX "scout_evaluations_pending_idx" ON "scout_evaluations" ("status", "next_dispatch_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "scout_evaluations_tenant_identity" ON "scout_evaluations" ("tenant_id", "id");
--> statement-breakpoint
CREATE TABLE "scout_evaluation_events" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "scout_id" text NOT NULL,
  "config_key" text NOT NULL,
  "event_key" text NOT NULL,
  "evaluation_id" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("tenant_id", "evaluation_id") REFERENCES "scout_evaluations"("tenant_id", "id") ON DELETE CASCADE,
  FOREIGN KEY ("tenant_id", "scout_id") REFERENCES "scouts"("tenant_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scout_evaluation_events_key" ON "scout_evaluation_events" ("tenant_id", "scout_id", "config_key", "event_key");
--> statement-breakpoint
ALTER TABLE "custom_agent_runs" ADD COLUMN "source_evaluation_id" text;
--> statement-breakpoint
ALTER TABLE "custom_agent_runs" ADD CONSTRAINT "custom_agent_runs_tenant_id_source_evaluation_id_scout_evaluations_tenant_id_id_fk" FOREIGN KEY ("tenant_id", "source_evaluation_id") REFERENCES "scout_evaluations"("tenant_id", "id");
