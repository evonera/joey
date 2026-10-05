-- Quarantine unsafe legacy cadences; an operator must explicitly reactivate.
UPDATE "scouts" SET "is_active" = false, "poll_interval_minutes" = 1440,
  "updated_at" = now() AT TIME ZONE 'UTC'
WHERE "poll_interval_minutes" NOT BETWEEN 15 AND 1440;
--> statement-breakpoint
ALTER TABLE "scouts" ADD CONSTRAINT "scouts_poll_interval_bounds"
  CHECK ("poll_interval_minutes" BETWEEN 15 AND 1440);
