CREATE TABLE onboarding_progress (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 current_step integer NOT NULL DEFAULT 0,
 status varchar(20) NOT NULL DEFAULT 'in_progress',
 completed_at timestamp,
 created_at timestamp NOT NULL DEFAULT now(),
 updated_at timestamp NOT NULL DEFAULT now(),
 CONSTRAINT onboarding_progress_status_check CHECK (status IN ('in_progress', 'dismissed', 'completed')),
 CONSTRAINT onboarding_progress_current_step_check CHECK (current_step >= 0)
);
CREATE UNIQUE INDEX onboarding_progress_tenant_user_key ON onboarding_progress(tenant_id, user_id);
