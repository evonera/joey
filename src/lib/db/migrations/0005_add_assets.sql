CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"key" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" bigint NOT NULL,
	"public_url" text NOT NULL,
	"width" bigint,
	"height" bigint,
	"tags" text[] DEFAULT '{}',
	"alt_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "assets_tenant_id_idx" ON "assets" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "assets_tags_idx" ON "assets" USING GIN ("tags");