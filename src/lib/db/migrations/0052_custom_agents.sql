CREATE UNIQUE INDEX "social_accounts_tenant_identity" ON "social_accounts" ("tenant_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "theme_pages_tenant_identity" ON "theme_pages" ("tenant_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scouts_tenant_identity" ON "scouts" ("tenant_id", "id");
--> statement-breakpoint
CREATE TABLE "custom_agents" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "description" varchar(600) NOT NULL DEFAULT '',
  "specialty" varchar(20) NOT NULL DEFAULT 'writer',
  "avatar_shape" varchar(20) NOT NULL DEFAULT 'orbit',
  "avatar_color" varchar(20) NOT NULL DEFAULT 'teal',
  "state" varchar(20) NOT NULL DEFAULT 'paused',
  "config_version" integer NOT NULL DEFAULT 1,
  "approved_version" integer,
  "daily_draft_limit" integer NOT NULL DEFAULT 3,
  "scout_id" text,
  "theme_page_id" text,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "custom_agents_quota_check" CHECK ("daily_draft_limit" BETWEEN 1 AND 12),
  CONSTRAINT "custom_agents_state_check" CHECK ("state" IN ('paused', 'active', 'archived')),
  CONSTRAINT "custom_agents_approval_check" CHECK ("state" <> 'active' OR ("approved_version" IS NOT NULL AND "approved_version" = "config_version")),
  FOREIGN KEY ("tenant_id", "scout_id") REFERENCES "scouts"("tenant_id", "id"),
  FOREIGN KEY ("tenant_id", "theme_page_id") REFERENCES "theme_pages"("tenant_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_agents_tenant_identity" ON "custom_agents" ("tenant_id", "id");
--> statement-breakpoint
CREATE INDEX "custom_agents_roster_idx" ON "custom_agents" ("tenant_id", "state", "updated_at");
--> statement-breakpoint
CREATE TABLE "custom_agent_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "account_id" text NOT NULL,
  FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "custom_agents"("tenant_id", "id") ON DELETE CASCADE,
  FOREIGN KEY ("tenant_id", "account_id") REFERENCES "social_accounts"("tenant_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_agent_account_binding" ON "custom_agent_accounts" ("tenant_id", "agent_id", "account_id");
--> statement-breakpoint
CREATE TABLE "custom_agent_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "version" integer NOT NULL,
  "config" jsonb NOT NULL,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "custom_agents"("tenant_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_agent_version_key" ON "custom_agent_versions" ("tenant_id", "agent_id", "version");
--> statement-breakpoint
CREATE TABLE "custom_agent_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "config_version" integer NOT NULL,
  "event_key" varchar(128) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'running',
  "lease_token" text NOT NULL,
  "lease_expires_at" timestamp NOT NULL,
  "attempt" integer NOT NULL DEFAULT 1,
  "package_id" text REFERENCES "content_packages"("id") ON DELETE SET NULL,
  "error" varchar(500),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "custom_agents"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "custom_agent_run_status_check" CHECK ("status" IN ('running', 'queued', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_agent_run_event" ON "custom_agent_runs" ("tenant_id", "agent_id", "config_version", "event_key");
--> statement-breakpoint
CREATE INDEX "custom_agent_run_history" ON "custom_agent_runs" ("tenant_id", "agent_id", "created_at");
--> statement-breakpoint
CREATE TABLE "custom_agent_threads" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "config_version" integer NOT NULL,
  "session_id" text NOT NULL UNIQUE,
  "title" varchar(120) NOT NULL DEFAULT 'New conversation',
  "status" varchar(24) NOT NULL DEFAULT 'ready',
  "stream_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "custom_agents"("tenant_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "custom_agent_thread_history" ON "custom_agent_threads" ("tenant_id", "user_id", "agent_id", "updated_at");
--> statement-breakpoint
CREATE TABLE "eve_session_owners" (
  "session_id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "agent_id" text,
  "config_version" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "custom_agents"("tenant_id", "id")
);
