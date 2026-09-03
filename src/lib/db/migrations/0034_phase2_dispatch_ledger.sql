ALTER TABLE "engagement_items" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" text PRIMARY KEY,
	"tenant_id" text REFERENCES "tenants"("id") ON DELETE set null,
	"kind" varchar(30) NOT NULL,
	"automation_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'ok' NOT NULL,
	"thread_id" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "automation_runs_tenant_id_idx" ON "automation_runs" USING btree ("tenant_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "automation_runs_kind_automation_idx" ON "automation_runs" USING btree ("kind", "automation_id");
