ALTER TABLE "theme_sources" ADD COLUMN "last_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "theme_sources" ADD COLUMN "last_success_at" timestamp;--> statement-breakpoint
ALTER TABLE "theme_sources" ADD COLUMN "last_poll_error" text;
