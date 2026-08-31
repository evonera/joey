ALTER TABLE "engagement_items" ADD COLUMN "social_account_id" text;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP INDEX "engagement_items_platform_comment_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_items_tenant_platform_comment_idx" ON "engagement_items" USING btree ("tenant_id","platform","platform_comment_id");
