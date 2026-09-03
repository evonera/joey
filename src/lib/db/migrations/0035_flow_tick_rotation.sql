ALTER TABLE "flows" ADD COLUMN "last_ticked_at" timestamp;
--> statement-breakpoint
CREATE INDEX "flows_last_ticked_at_idx" ON "flows" USING btree ("status", "last_ticked_at");
