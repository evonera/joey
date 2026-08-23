CREATE TABLE "rate_limit_counters" (
	"token_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_token_window_idx" ON "rate_limit_counters" USING btree ("token_id","window_start");