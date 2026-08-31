CREATE TABLE "telegram_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "installation_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "chat_id" text NOT NULL,
  "text" text NOT NULL,
  "reply_markup" jsonb,
  "status" varchar(30) DEFAULT 'pending' NOT NULL,
  "telegram_message_id" bigint,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "sent_at" timestamp,
  CONSTRAINT "telegram_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
  CONSTRAINT "telegram_outbox_installation_id_telegram_bot_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."telegram_bot_installations"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_outbox_tenant_idempotency_idx" ON "telegram_outbox" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "telegram_outbox_pending_idx" ON "telegram_outbox" ("status", "created_at");
