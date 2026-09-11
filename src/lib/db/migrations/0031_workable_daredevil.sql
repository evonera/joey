-- Theme Studio tables only. Engagement, flows, and Telegram objects are
-- already installed by migrations 0022–0030.
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
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_slot_id_theme_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."theme_slots"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_cluster_id_story_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."story_clusters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_format_id_theme_content_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."theme_content_formats"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_template_id_theme_visual_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."theme_visual_templates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dm_automation_rules" ADD CONSTRAINT "dm_automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dm_automation_rules" ADD CONSTRAINT "dm_automation_rules_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_source_id_theme_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."theme_sources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "story_clusters" ADD CONSTRAINT "story_clusters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "story_clusters" ADD CONSTRAINT "story_clusters_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_content_formats" ADD CONSTRAINT "theme_content_formats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_pages" ADD CONSTRAINT "theme_pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_slots" ADD CONSTRAINT "theme_slots_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_slots" ADD CONSTRAINT "theme_slots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_slots" ADD CONSTRAINT "theme_slots_format_id_theme_content_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."theme_content_formats"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_sources" ADD CONSTRAINT "theme_sources_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_sources" ADD CONSTRAINT "theme_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_visual_templates" ADD CONSTRAINT "theme_visual_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_visual_templates" ADD CONSTRAINT "theme_visual_templates_theme_page_id_theme_pages_id_fk" FOREIGN KEY ("theme_page_id") REFERENCES "public"."theme_pages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "theme_visual_templates" ADD CONSTRAINT "theme_visual_templates_format_id_theme_content_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."theme_content_formats"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "content_packages_page_status_idx" ON "content_packages" USING btree ("theme_page_id","status","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "content_packages_tenant_id_idx" ON "content_packages" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "dm_automation_rules_page_id_idx" ON "dm_automation_rules" USING btree ("theme_page_id");
--> statement-breakpoint
CREATE INDEX "dm_automation_rules_tenant_id_idx" ON "dm_automation_rules" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "source_items_page_id_idx" ON "source_items" USING btree ("theme_page_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "source_items_tenant_id_idx" ON "source_items" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "source_items_canonical_url_idx" ON "source_items" USING btree ("theme_page_id","canonical_url_hash") WHERE "source_items"."canonical_url_hash" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "source_items_content_hash_idx" ON "source_items" USING btree ("theme_page_id","content_hash");
--> statement-breakpoint
CREATE INDEX "story_clusters_page_id_idx" ON "story_clusters" USING btree ("theme_page_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "story_clusters_tenant_id_idx" ON "story_clusters" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "theme_content_formats_tenant_slug_idx" ON "theme_content_formats" USING btree ("tenant_id","slug");
--> statement-breakpoint
CREATE INDEX "theme_pages_tenant_id_idx" ON "theme_pages" USING btree ("tenant_id","updated_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "theme_slots_page_id_idx" ON "theme_slots" USING btree ("theme_page_id");
--> statement-breakpoint
CREATE INDEX "theme_slots_tenant_id_idx" ON "theme_slots" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "theme_sources_page_id_idx" ON "theme_sources" USING btree ("theme_page_id");
--> statement-breakpoint
CREATE INDEX "theme_sources_tenant_id_idx" ON "theme_sources" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "theme_visual_templates_tenant_id_idx" ON "theme_visual_templates" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "theme_visual_templates_page_id_idx" ON "theme_visual_templates" USING btree ("theme_page_id");
