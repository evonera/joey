CREATE TABLE "r2_cleanup_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "key" text NOT NULL,
  "reason" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "r2_cleanup_tasks_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "r2_cleanup_tasks" ADD CONSTRAINT "r2_cleanup_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "r2_cleanup_tasks_due_idx" ON "r2_cleanup_tasks" USING btree ("next_attempt_at");
