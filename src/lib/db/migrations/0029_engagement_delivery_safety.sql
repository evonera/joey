ALTER TABLE "engagement_items" ADD COLUMN "social_account_id" text;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP INDEX "engagement_items_platform_comment_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_items_tenant_platform_comment_idx" ON "engagement_items" USING btree ("tenant_id","platform","platform_comment_id");
--> statement-breakpoint
WITH "ranked_active_drafts" AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "tenant_id", "engagement_item_id"
    ORDER BY "created_at" DESC, "id" DESC
  ) AS "draft_rank"
  FROM "reply_drafts"
  WHERE "status" IN ('pending_review', 'approved', 'sending', 'failed')
)
UPDATE "reply_drafts"
SET "status" = 'rejected', "feedback" = COALESCE("feedback", 'Superseded during engagement delivery safety migration.')
WHERE "id" IN (SELECT "id" FROM "ranked_active_drafts" WHERE "draft_rank" > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "reply_drafts_active_engagement_idx" ON "reply_drafts" USING btree ("tenant_id","engagement_item_id") WHERE "status" in ('pending_review', 'approved', 'sending', 'failed');
