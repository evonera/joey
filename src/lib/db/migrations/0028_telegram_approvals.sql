CREATE TABLE "telegram_approvals" (
  "id" text PRIMARY KEY NOT NULL, "tenant_id" text NOT NULL, "installation_id" text NOT NULL, "run_id" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE, "status" varchar(30) DEFAULT 'pending' NOT NULL, "decision" boolean,
  "decided_by_telegram_user_id" bigint, "expires_at" timestamp NOT NULL, "decided_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
  CONSTRAINT "telegram_approvals_installation_id_telegram_bot_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."telegram_bot_installations"("id") ON DELETE cascade,
  CONSTRAINT "telegram_approvals_run_id_flow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."flow_runs"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "telegram_approvals_pending_idx" ON "telegram_approvals" ("status", "expires_at");
--> statement-breakpoint
CREATE INDEX "telegram_approvals_run_idx" ON "telegram_approvals" ("run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_approvals_one_pending_run_idx" ON "telegram_approvals" ("run_id") WHERE "status" = 'pending';
