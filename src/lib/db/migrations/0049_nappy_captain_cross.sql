CREATE TABLE "agent_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"cost_usd" numeric(14, 8) NOT NULL,
	"kind" varchar(30) DEFAULT 'text' NOT NULL,
	"model_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"kind" varchar(30) NOT NULL,
	"automation_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'ok' NOT NULL,
	"thread_id" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_render_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"spec" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"attempt_token" text,
	"output_asset_id" text,
	"error" text,
	"usage" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" text NOT NULL,
	"attempt_token" text NOT NULL,
	"words" jsonb,
	"duration_seconds" double precision,
	"estimated_cost_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mix_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"theme_page_id" text NOT NULL,
	"format_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"adjustments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "usage_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" varchar(30) NOT NULL,
	"model_id" text,
	"period_start" timestamp NOT NULL,
	"reserved_cost_usd" numeric(14, 8) NOT NULL,
	"actual_cost_usd" numeric(14, 8),
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'reserved' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_tracking" ALTER COLUMN "estimated_cost_usd" SET DATA TYPE numeric(14, 8);--> statement-breakpoint
ALTER TABLE "usage_tracking" ALTER COLUMN "estimated_cost_usd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "pause_reason" text;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_status" varchar(20);--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_lease_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_error" text;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_message_id" text;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "flows" ADD COLUMN "last_ticked_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "zernio_profile_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "dodo_subscription_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "dodo_checkout_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "dodo_checkout_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "dodo_checkout_plan" varchar(50);--> statement-breakpoint
ALTER TABLE "usage_tracking" ADD COLUMN "reserved_cost_usd" numeric(14, 8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_usage_events" ADD CONSTRAINT "agent_usage_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_render_jobs" ADD CONSTRAINT "media_render_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_render_jobs" ADD CONSTRAINT "media_render_jobs_output_asset_id_assets_id_fk" FOREIGN KEY ("output_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_transcripts" ADD CONSTRAINT "media_transcripts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_recommendations" ADD CONSTRAINT "mix_recommendations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_recommendations" ADD CONSTRAINT "mix_recommendations_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_runs" ADD CONSTRAINT "scout_runs_scout_id_scouts_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."scouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_runs" ADD CONSTRAINT "scout_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouts" ADD CONSTRAINT "scouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_usage_events_tenant_created_idx" ON "agent_usage_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_runs_tenant_id_idx" ON "automation_runs" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "automation_runs_kind_automation_idx" ON "automation_runs" USING btree ("kind","automation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_render_jobs_tenant_id_input_hash_key" ON "media_render_jobs" USING btree ("tenant_id","input_hash");--> statement-breakpoint
CREATE INDEX "media_render_jobs_queue_idx" ON "media_render_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_transcripts_tenant_id_input_hash_key" ON "media_transcripts" USING btree ("tenant_id","input_hash");--> statement-breakpoint
CREATE INDEX "mix_recommendations_tenant_id_idx" ON "mix_recommendations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mix_recommendations_page_id_idx" ON "mix_recommendations" USING btree ("theme_page_id");--> statement-breakpoint
CREATE INDEX "mix_recommendations_pending_idx" ON "mix_recommendations" USING btree ("tenant_id","theme_page_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_progress_tenant_user_key" ON "onboarding_progress" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "scout_runs_scout_id_idx" ON "scout_runs" USING btree ("scout_id");--> statement-breakpoint
CREATE INDEX "scout_runs_tenant_id_idx" ON "scout_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scouts_tenant_id_idx" ON "scouts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scouts_active_idx" ON "scouts" USING btree ("is_active","last_polled_at");--> statement-breakpoint
CREATE INDEX "usage_reservations_tenant_status_idx" ON "usage_reservations" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "engagement_items_dm_dispatch_idx" ON "engagement_items" USING btree ("tenant_id","dm_dispatch_status","dm_dispatch_lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memories_one_brand_guideline_per_tenant_idx" ON "memories" USING btree ("tenant_id") WHERE "memories"."type" = 'brand_guideline';--> statement-breakpoint
CREATE INDEX "webhook_events_recovery_idx" ON "webhook_events" USING btree ("status","updated_at") WHERE "webhook_events"."status" IN ('pending', 'processing', 'failed');