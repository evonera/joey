ALTER TABLE "drafts" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "variants" jsonb;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "selected_variant_id" text;