CREATE TABLE "mix_recommendations" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"theme_page_id" text NOT NULL REFERENCES "theme_pages"("id") ON DELETE cascade,
	"format_scores" jsonb DEFAULT '{}' NOT NULL,
	"adjustments" jsonb DEFAULT '[]' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "mix_recommendations_tenant_id_idx" ON "mix_recommendations" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "mix_recommendations_page_id_idx" ON "mix_recommendations" USING btree ("theme_page_id");
--> statement-breakpoint
CREATE INDEX "mix_recommendations_pending_idx" ON "mix_recommendations" USING btree ("tenant_id", "theme_page_id", "status");
