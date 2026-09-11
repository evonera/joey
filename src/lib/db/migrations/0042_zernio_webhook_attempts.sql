ALTER TABLE "webhook_events" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX "webhook_events_recovery_idx" ON "webhook_events" ("status", "updated_at") WHERE "status" IN ('pending', 'processing', 'failed');
