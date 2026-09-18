CREATE TABLE "scout_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"scout_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"status" varchar(30) NOT NULL,
	"items_found" integer DEFAULT 0 NOT NULL,
	"alert_data" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scouts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"target_url" text NOT NULL,
	"platform" varchar(30) DEFAULT 'instagram' NOT NULL,
	"goal_condition" text NOT NULL,
	"poll_interval_minutes" integer DEFAULT 120 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_polled_at" timestamp,
	"latest_alert" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_runs" ADD CONSTRAINT "scout_runs_scout_id_scouts_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."scouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_runs" ADD CONSTRAINT "scout_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouts" ADD CONSTRAINT "scouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scout_runs_scout_id_idx" ON "scout_runs" USING btree ("scout_id");--> statement-breakpoint
CREATE INDEX "scout_runs_tenant_id_idx" ON "scout_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scouts_tenant_id_idx" ON "scouts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scouts_active_idx" ON "scouts" USING btree ("is_active","last_polled_at");