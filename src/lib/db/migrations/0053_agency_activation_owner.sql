ALTER TABLE "custom_agents" ADD COLUMN "approved_by" text REFERENCES "user"("id");
--> statement-breakpoint
-- Earlier activation had no recorded approver. Require explicit reactivation;
-- never infer spending authority from a member who merely created an agent.
UPDATE "custom_agents" SET "state" = 'paused', "approved_version" = NULL WHERE "state" = 'active';
--> statement-breakpoint
UPDATE "custom_agent_runs" SET "status" = 'cancelled', "updated_at" = now() WHERE "status" = 'running';
--> statement-breakpoint
ALTER TABLE "custom_agents" ADD CONSTRAINT "custom_agents_approver_check" CHECK ("state" <> 'active' OR "approved_by" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "custom_agent_runs" ADD COLUMN "source_alert" jsonb;
