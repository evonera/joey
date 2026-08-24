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
CREATE TABLE "flows" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"graph" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"token_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_templates" ADD CONSTRAINT "flow_templates_author_tenant_id_tenants_id_fk" FOREIGN KEY ("author_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_runs_flow_id_idx" ON "flow_runs" USING btree ("flow_id","started_at");--> statement-breakpoint
CREATE INDEX "flow_runs_tenant_id_idx" ON "flow_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runs_running_scheduled_idx" ON "flow_runs" USING btree ("flow_id") WHERE (status IN ('running','waiting_approval') AND trigger = 'schedule');--> statement-breakpoint
CREATE INDEX "flows_tenant_id_idx" ON "flows" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_token_window_idx" ON "rate_limit_counters" USING btree ("token_id","window_start");