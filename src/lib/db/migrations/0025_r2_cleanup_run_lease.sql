ALTER TABLE "r2_cleanup_tasks" ADD COLUMN "run_id" text;
--> statement-breakpoint
ALTER TABLE "r2_cleanup_tasks" ADD CONSTRAINT "r2_cleanup_tasks_run_id_flow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."flow_runs"("id") ON DELETE set null ON UPDATE no action;
