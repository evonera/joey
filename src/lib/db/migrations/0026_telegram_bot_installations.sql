CREATE TABLE "telegram_bot_installations" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL UNIQUE,
  "encrypted_token" text NOT NULL,
  "webhook_secret_hash" text NOT NULL,
  "bot_telegram_id" bigint NOT NULL,
  "bot_username" varchar(64),
  "allowed_user_ids" bigint[] DEFAULT '{}' NOT NULL,
  "status" varchar(30) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_bot_installations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "telegram_updates" (
  "id" text PRIMARY KEY NOT NULL,
  "installation_id" text NOT NULL,
  "update_id" bigint NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(30) DEFAULT 'pending' NOT NULL,
  "error" text,
  "processed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_updates_installation_id_telegram_bot_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."telegram_bot_installations"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_updates_installation_update_idx" ON "telegram_updates" ("installation_id", "update_id");
--> statement-breakpoint
CREATE INDEX "telegram_updates_pending_idx" ON "telegram_updates" ("status", "created_at");
