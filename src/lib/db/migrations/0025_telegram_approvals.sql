CREATE TABLE "telegram_pending_approvals" (
	"nonce" varchar(40) PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_pending_approvals" ADD CONSTRAINT "telegram_pending_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_pending_approvals" ADD CONSTRAINT "telegram_pending_approvals_run_id_flow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."flow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tg_pending_run_idx" ON "telegram_pending_approvals" USING btree ("run_id");