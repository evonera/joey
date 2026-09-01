CREATE TABLE "content_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"theme_page_id" text NOT NULL,
	"slot_id" text,
	"cluster_id" text,
	"format_id" text NOT NULL,
	"template_id" text,
	"title" text NOT NULL,
	"caption" text,
	"hashtags" text[] DEFAULT '{}',
	"rendered_asset_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'pending_review' NOT NULL,
	"scheduled_for" timestamp,
	"published_at" timestamp,
	"published_post_id" text,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"theme_page_id" text NOT NULL,
	"trigger_type" varchar(20) DEFAULT 'keyword' NOT NULL,
	"trigger_value" text NOT NULL,
	"response_template" text NOT NULL,
	"response_link" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"platform" varchar(50) NOT NULL,
	"external_activity_id" text NOT NULL,
	"event_id" text,
	"type" varchar(30) NOT NULL,
	"direction" varchar(20) DEFAULT 'incoming' NOT NULL,
	"body" text,
	"actor_id" text,
	"actor_name" text,
	"actor_handle" text,
	"actor_avatar" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"delivery_status" varchar(30),
	"is_read" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"social_account_id" text,
	"platform" varchar(50) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"external_conversation_id" text NOT NULL,
	"contact_id" text,
	"participant_id" text,
	"participant_name" text,
	"participant_handle" text,
	"participant_avatar" text,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_preview" text,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_sync_cursors" (
	"tenant_id" text NOT NULL,
	"source" varchar(30) NOT NULL,
	"cursor" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"status" varchar(30) DEFAULT 'running' NOT NULL,
	"trigger" varchar(30) DEFAULT 'manual' NOT NULL,
	"trigger_payload" jsonb,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_node_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fanout_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "flow_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(140) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"graph" jsonb NOT NULL,
	"is_official" boolean DEFAULT false NOT NULL,
	"author_tenant_id" text,
	"installs" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flow_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "flow_webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"delivery_id" text,
	"payload" jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'processing' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"error" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"graph" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"webhook_secret" text,
	"execution_revision" integer DEFAULT 1 NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "r2_cleanup_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"run_id" text,
	"key" text NOT NULL,
	"reason" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "r2_cleanup_tasks_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"theme_page_id" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text,
	"body" text,
	"url" text,
	"canonical_url_hash" text,
	"content_hash" text,
	"published_at" timestamp,
	"rights_category" varchar(30) DEFAULT 'unknown' NOT NULL,
	"metadata" jsonb,
	"embedding" vector(1536),
	"status" varchar(20) DEFAULT 'raw' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"theme_page_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"member_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding_centroid" vector(1536),
	"freshness_score" numeric(5, 2),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"run_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"decision" boolean,
	"decided_by_telegram_user_id" bigint,
	"expires_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_approvals_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "telegram_bot_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"webhook_secret_hash" text NOT NULL,
	"bot_telegram_id" bigint NOT NULL,
	"bot_username" varchar(64),
	"allowed_user_ids" bigint[] DEFAULT '{}' NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_bot_installations_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"chat_id" text NOT NULL,
	"text" text NOT NULL,
	"reply_markup" jsonb,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"telegram_message_id" bigint,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "telegram_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" text NOT NULL,
	"update_id" bigint NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"error" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme_content_formats" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"platform" varchar(30) NOT NULL,
	"media_type" varchar(20) NOT NULL,
	"aspect_ratio" varchar(10),
	"width" integer,
	"height" integer,
	"duration_range" jsonb,
	"renderer" varchar(20) NOT NULL,
	"template_component_path" text,
	"default_props_schema" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"niche" text,
	"audience" text,
	"voice" text,
	"brand_kit" jsonb,
	"connected_accounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_rights_policy" varchar(30) DEFAULT 'strict' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"recipe_revision" integer DEFAULT 1 NOT NULL,
	"last_compiled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"theme_page_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"format_id" text NOT NULL,
	"label" varchar(80),
	"cadence" varchar(20) DEFAULT 'daily' NOT NULL,
	"days_of_week" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"override_template_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"theme_page_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"source_type" varchar(30) NOT NULL,
	"url" text NOT NULL,
	"poll_interval_minutes" integer DEFAULT 60 NOT NULL,
	"freshness_window_hours" integer DEFAULT 24 NOT NULL,
	"geo_filter" text,
	"lang_filter" varchar(10),
	"rights_category" varchar(30) DEFAULT 'unknown' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_polled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme_visual_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"theme_page_id" text,
	"name" varchar(120) NOT NULL,
	"format_id" text NOT NULL,
	"renderer" varchar(20) NOT NULL,
	"component_spec" jsonb NOT NULL,
	"props_schema" jsonb,
	"preview_url" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "engagement_items_platform_comment_idx";--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "social_account_id" text;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "activity_id" text;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD COLUMN "send_claimed_at" timestamp;--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_slot_id_theme_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."theme_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_cluster_id_story_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."story_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_format_id_theme_content_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."theme_content_formats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_template_id_theme_visual_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."theme_visual_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_automation_rules" ADD CONSTRAINT "dm_automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_automation_rules" ADD CONSTRAINT "dm_automation_rules_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_activities" ADD CONSTRAINT "engagement_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_activities" ADD CONSTRAINT "engagement_activities_conversation_id_engagement_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."engagement_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_conversations" ADD CONSTRAINT "engagement_conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_conversations" ADD CONSTRAINT "engagement_conversations_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_sync_cursors" ADD CONSTRAINT "engagement_sync_cursors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_templates" ADD CONSTRAINT "flow_templates_author_tenant_id_tenants_id_fk" FOREIGN KEY ("author_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_webhook_deliveries" ADD CONSTRAINT "flow_webhook_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_webhook_deliveries" ADD CONSTRAINT "flow_webhook_deliveries_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "r2_cleanup_tasks" ADD CONSTRAINT "r2_cleanup_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "r2_cleanup_tasks" ADD CONSTRAINT "r2_cleanup_tasks_run_id_flow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."flow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_source_id_theme_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."theme_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_clusters" ADD CONSTRAINT "story_clusters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_clusters" ADD CONSTRAINT "story_clusters_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_approvals" ADD CONSTRAINT "telegram_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_approvals" ADD CONSTRAINT "telegram_approvals_installation_id_telegram_bot_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."telegram_bot_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_approvals" ADD CONSTRAINT "telegram_approvals_run_id_flow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."flow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_bot_installations" ADD CONSTRAINT "telegram_bot_installations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_outbox" ADD CONSTRAINT "telegram_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_outbox" ADD CONSTRAINT "telegram_outbox_installation_id_telegram_bot_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."telegram_bot_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_updates" ADD CONSTRAINT "telegram_updates_installation_id_telegram_bot_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."telegram_bot_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_content_formats" ADD CONSTRAINT "theme_content_formats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_pages" ADD CONSTRAINT "theme_pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_slots" ADD CONSTRAINT "theme_slots_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_slots" ADD CONSTRAINT "theme_slots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_slots" ADD CONSTRAINT "theme_slots_format_id_theme_content_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."theme_content_formats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_sources" ADD CONSTRAINT "theme_sources_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_sources" ADD CONSTRAINT "theme_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_visual_templates" ADD CONSTRAINT "theme_visual_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_visual_templates" ADD CONSTRAINT "theme_visual_templates_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_visual_templates" ADD CONSTRAINT "theme_visual_templates_format_id_theme_content_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."theme_content_formats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_packages_page_status_idx" ON "content_packages" USING btree ("theme_page_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_packages_tenant_id_idx" ON "content_packages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "dm_automation_rules_page_id_idx" ON "dm_automation_rules" USING btree ("theme_page_id");--> statement-breakpoint
CREATE INDEX "dm_automation_rules_tenant_id_idx" ON "dm_automation_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_activities_external_idx" ON "engagement_activities" USING btree ("tenant_id","conversation_id","external_activity_id");--> statement-breakpoint
CREATE INDEX "engagement_activities_timeline_idx" ON "engagement_activities" USING btree ("tenant_id","conversation_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_conversations_external_idx" ON "engagement_conversations" USING btree ("tenant_id","platform","kind","external_conversation_id");--> statement-breakpoint
CREATE INDEX "engagement_conversations_queue_idx" ON "engagement_conversations" USING btree ("tenant_id","status","last_activity_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_sync_cursors_tenant_source_idx" ON "engagement_sync_cursors" USING btree ("tenant_id","source");--> statement-breakpoint
CREATE INDEX "flow_runs_flow_id_idx" ON "flow_runs" USING btree ("flow_id","started_at");--> statement-breakpoint
CREATE INDEX "flow_runs_tenant_id_idx" ON "flow_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runs_running_scheduled_idx" ON "flow_runs" USING btree ("flow_id") WHERE "flow_runs"."status" IN ('running','waiting_approval') AND "flow_runs"."trigger" = 'schedule';--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runs_running_webhook_idx" ON "flow_runs" USING btree ("flow_id",("trigger_payload"->>'id')) WHERE "flow_runs"."status" IN ('running','waiting_approval') AND "flow_runs"."trigger" = 'webhook';--> statement-breakpoint
CREATE INDEX "flow_webhook_deliveries_flow_created_idx" ON "flow_webhook_deliveries" USING btree ("flow_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_webhook_deliveries_explicit_idx" ON "flow_webhook_deliveries" USING btree ("tenant_id","flow_id","delivery_id") WHERE "flow_webhook_deliveries"."delivery_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "flows_tenant_id_idx" ON "flows" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE INDEX "r2_cleanup_tasks_due_idx" ON "r2_cleanup_tasks" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "source_items_page_id_idx" ON "source_items" USING btree ("theme_page_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "source_items_tenant_id_idx" ON "source_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_items_canonical_url_idx" ON "source_items" USING btree ("theme_page_id","canonical_url_hash") WHERE "source_items"."canonical_url_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "source_items_content_hash_idx" ON "source_items" USING btree ("theme_page_id","content_hash");--> statement-breakpoint
CREATE INDEX "story_clusters_page_id_idx" ON "story_clusters" USING btree ("theme_page_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "story_clusters_tenant_id_idx" ON "story_clusters" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "telegram_approvals_pending_idx" ON "telegram_approvals" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "telegram_approvals_run_idx" ON "telegram_approvals" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_approvals_one_pending_run_idx" ON "telegram_approvals" USING btree ("run_id") WHERE "telegram_approvals"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_outbox_tenant_idempotency_idx" ON "telegram_outbox" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "telegram_outbox_pending_idx" ON "telegram_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_updates_installation_update_idx" ON "telegram_updates" USING btree ("installation_id","update_id");--> statement-breakpoint
CREATE INDEX "telegram_updates_pending_idx" ON "telegram_updates" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "theme_content_formats_tenant_slug_idx" ON "theme_content_formats" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "theme_pages_tenant_id_idx" ON "theme_pages" USING btree ("tenant_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "theme_slots_page_id_idx" ON "theme_slots" USING btree ("theme_page_id");--> statement-breakpoint
CREATE INDEX "theme_slots_tenant_id_idx" ON "theme_slots" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "theme_sources_page_id_idx" ON "theme_sources" USING btree ("theme_page_id");--> statement-breakpoint
CREATE INDEX "theme_sources_tenant_id_idx" ON "theme_sources" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "theme_visual_templates_tenant_id_idx" ON "theme_visual_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "theme_visual_templates_page_id_idx" ON "theme_visual_templates" USING btree ("theme_page_id");--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_conversation_id_engagement_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."engagement_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_activity_id_engagement_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."engagement_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_items_tenant_platform_comment_idx" ON "engagement_items" USING btree ("tenant_id","platform","platform_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_drafts_active_engagement_idx" ON "reply_drafts" USING btree ("tenant_id","engagement_item_id") WHERE "reply_drafts"."status" in ('pending_review', 'approved', 'sending', 'failed');