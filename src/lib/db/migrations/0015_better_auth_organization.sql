CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"inviterId" text NOT NULL,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text NOT NULL,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_configs" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "agent_configs" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "agent_configs" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "drafts" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "drafts" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "drafts" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "engagement_items" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "engagement_items" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "engagement_items" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "draft_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reply_drafts" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reply_drafts" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reply_drafts" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reply_drafts" ALTER COLUMN "engagement_item_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "social_accounts" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "social_accounts" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "social_accounts" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "social_entities" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "social_entities" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "social_entities" ALTER COLUMN "social_account_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tenant_memory_profiles" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tenant_memory_profiles" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tenant_memory_profiles" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "usage_tracking" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "usage_tracking" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "usage_tracking" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "activeOrganizationId" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_tenants_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_user_id_fk" FOREIGN KEY ("inviterId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_tenants_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt")
SELECT
    gen_random_uuid()::text,
    id,
    owner_id,
    'owner',
    COALESCE(created_at, NOW())
FROM "tenants"
WHERE owner_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_slug_unique" UNIQUE("slug");