CREATE TABLE "scout_remixes" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scout_id" text NOT NULL REFERENCES "scouts"("id") ON DELETE CASCADE,
  "theme_page_id" text NOT NULL REFERENCES "theme_pages"("id") ON DELETE CASCADE,
  "event_key" text NOT NULL,
  "status" varchar(24) DEFAULT 'processing' NOT NULL,
  "lease_token" text NOT NULL,
  "lease_expires_at" timestamp NOT NULL,
  "package_id" text REFERENCES "content_packages"("id") ON DELETE SET NULL,
  "cluster_id" text REFERENCES "story_clusters"("id") ON DELETE SET NULL,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scout_remixes_source_event_key" ON "scout_remixes" ("tenant_id", "scout_id", "theme_page_id", "event_key");
--> statement-breakpoint
CREATE INDEX "scout_remixes_pending_idx" ON "scout_remixes" ("status", "lease_expires_at");
