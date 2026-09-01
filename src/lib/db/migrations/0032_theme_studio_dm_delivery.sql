ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_status" varchar(20);--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_lease_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_error" text;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD COLUMN "dm_dispatch_message_id" text;--> statement-breakpoint
CREATE INDEX "engagement_items_dm_dispatch_idx" ON "engagement_items" USING btree ("tenant_id", "dm_dispatch_status", "dm_dispatch_lease_expires_at");
