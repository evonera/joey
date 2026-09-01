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
);--> statement-breakpoint
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
);--> statement-breakpoint
CREATE TABLE "engagement_sync_cursors" (
  "tenant_id" text NOT NULL,
  "source" varchar(30) NOT NULL,
  "cursor" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "activity_id" text;--> statement-breakpoint
ALTER TABLE "engagement_conversations" ADD CONSTRAINT "engagement_conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_conversations" ADD CONSTRAINT "engagement_conversations_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_activities" ADD CONSTRAINT "engagement_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_activities" ADD CONSTRAINT "engagement_activities_conversation_id_engagement_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."engagement_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_sync_cursors" ADD CONSTRAINT "engagement_sync_cursors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_conversations_external_idx" ON "engagement_conversations" USING btree ("tenant_id","platform","kind","external_conversation_id");--> statement-breakpoint
CREATE INDEX "engagement_conversations_queue_idx" ON "engagement_conversations" USING btree ("tenant_id","status","last_activity_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_activities_external_idx" ON "engagement_activities" USING btree ("tenant_id","conversation_id","external_activity_id");--> statement-breakpoint
CREATE INDEX "engagement_activities_timeline_idx" ON "engagement_activities" USING btree ("tenant_id","conversation_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_sync_cursors_tenant_source_idx" ON "engagement_sync_cursors" USING btree ("tenant_id","source");--> statement-breakpoint
INSERT INTO "engagement_conversations" ("id", "tenant_id", "social_account_id", "platform", "kind", "external_conversation_id", "participant_name", "participant_handle", "participant_avatar", "status", "unread_count", "last_message_preview", "last_activity_at", "metadata", "created_at", "updated_at")
SELECT DISTINCT ON ("tenant_id", "platform", COALESCE("platform_post_id", "platform_comment_id", "id"))
  'legacy-comment:' || md5("tenant_id" || ':' || "platform" || ':' || COALESCE("platform_post_id", "platform_comment_id", "id")),
  "tenant_id", "social_account_id", "platform", 'comment', COALESCE("platform_post_id", "platform_comment_id", "id"), "commenter_name", "commenter_handle", "commenter_avatar",
  CASE WHEN "status" = 'pending' THEN 'active' ELSE "status" END,
  (count(*) FILTER (WHERE "status" = 'pending') OVER (PARTITION BY "tenant_id", "platform", COALESCE("platform_post_id", "platform_comment_id", "id")))::integer,
  "text", "created_at", "metadata", min("created_at") OVER (PARTITION BY "tenant_id", "platform", COALESCE("platform_post_id", "platform_comment_id", "id")), "created_at"
FROM "engagement_items"
ORDER BY "tenant_id", "platform", COALESCE("platform_post_id", "platform_comment_id", "id"), "created_at" DESC, "id" DESC;--> statement-breakpoint
INSERT INTO "engagement_activities" ("id", "tenant_id", "conversation_id", "platform", "external_activity_id", "type", "direction", "body", "actor_name", "actor_handle", "actor_avatar", "is_read", "occurred_at", "metadata", "created_at", "updated_at")
SELECT 'legacy-activity:' || "id", "tenant_id", 'legacy-comment:' || md5("tenant_id" || ':' || "platform" || ':' || COALESCE("platform_post_id", "platform_comment_id", "id")), "platform", COALESCE("platform_comment_id", "id"), "type", 'incoming', "text", "commenter_name", "commenter_handle", "commenter_avatar", "status" <> 'pending', "created_at", "metadata", "created_at", "created_at"
FROM "engagement_items";--> statement-breakpoint
UPDATE "engagement_items" SET "conversation_id" = 'legacy-comment:' || md5("tenant_id" || ':' || "platform" || ':' || COALESCE("platform_post_id", "platform_comment_id", "id")), "activity_id" = 'legacy-activity:' || "id";--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_conversation_id_engagement_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."engagement_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_activity_id_engagement_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."engagement_activities"("id") ON DELETE cascade ON UPDATE no action;
