CREATE TABLE "engagement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"platform_post_id" text,
	"platform_comment_id" text,
	"commenter_name" text,
	"commenter_handle" text,
	"commenter_avatar" text,
	"text" text NOT NULL,
	"type" varchar(20) DEFAULT 'comment' NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reply_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_item_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" varchar(50) DEFAULT 'pending_review' NOT NULL,
	"feedback" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_engagement_item_id_engagement_items_id_fk" FOREIGN KEY ("engagement_item_id") REFERENCES "public"."engagement_items"("id") ON DELETE cascade ON UPDATE no action;