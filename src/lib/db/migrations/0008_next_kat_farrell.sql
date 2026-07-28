CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"in_app_draft_ready" boolean DEFAULT true NOT NULL,
	"in_app_engagement_reply" boolean DEFAULT true NOT NULL,
	"in_app_api_failure" boolean DEFAULT true NOT NULL,
	"in_app_publish_success" boolean DEFAULT false NOT NULL,
	"in_app_publish_failed" boolean DEFAULT true NOT NULL,
	"email_draft_ready" boolean DEFAULT false NOT NULL,
	"email_engagement_reply" boolean DEFAULT false NOT NULL,
	"email_api_failure" boolean DEFAULT true NOT NULL,
	"email_publish_success" boolean DEFAULT false NOT NULL,
	"email_publish_failed" boolean DEFAULT true NOT NULL,
	"email_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;