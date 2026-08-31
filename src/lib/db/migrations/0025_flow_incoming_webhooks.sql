ALTER TABLE "flows" ADD COLUMN "execution_revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE "flow_webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"delivery_id" text,
	"payload" jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'processing' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"error" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flow_webhook_deliveries" ADD CONSTRAINT "flow_webhook_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "flow_webhook_deliveries" ADD CONSTRAINT "flow_webhook_deliveries_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "flow_webhook_deliveries_flow_created_idx" ON "flow_webhook_deliveries" USING btree ("flow_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "flow_webhook_deliveries_explicit_idx" ON "flow_webhook_deliveries" USING btree ("tenant_id","flow_id","delivery_id") WHERE "delivery_id" IS NOT NULL;
