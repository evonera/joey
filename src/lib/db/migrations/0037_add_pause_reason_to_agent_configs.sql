ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "pause_reason" text;

-- 1. Mark as api_failure if the tenant has a revoked Zernio key, no active Zernio key, or drafts failed due to API connection failure
UPDATE "agent_configs" ac
SET "pause_reason" = 'api_failure'
WHERE ac."is_paused" = true
  AND ac."pause_reason" IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM "api_keys" k
      WHERE k."tenant_id" = ac."tenant_id"
        AND k."provider" = 'zernio'
        AND k."status" = 'revoked'
    )
    OR NOT EXISTS (
      SELECT 1 FROM "api_keys" k
      WHERE k."tenant_id" = ac."tenant_id"
        AND k."provider" = 'zernio'
        AND k."status" = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM "drafts" d
      WHERE d."tenant_id" = ac."tenant_id"
        AND d."status" = 'failed'
        AND d."error_message" LIKE '%API Connection Failure%'
    )
  );

-- 2. Mark as budget_exceeded ONLY if spend reached/exceeded budget limit, an active Zernio key exists, and no API failure drafts exist
UPDATE "agent_configs" ac
SET "pause_reason" = 'budget_exceeded'
FROM "usage_tracking" ut
WHERE ac."tenant_id" = ut."tenant_id"
  AND ac."is_paused" = true
  AND ac."pause_reason" IS NULL
  AND ut."estimated_cost_usd" >= ut."budget_limit_usd"
  AND EXISTS (
    SELECT 1 FROM "api_keys" k
    WHERE k."tenant_id" = ac."tenant_id"
      AND k."provider" = 'zernio'
      AND k."status" = 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "drafts" d
    WHERE d."tenant_id" = ac."tenant_id"
      AND d."status" = 'failed'
      AND d."error_message" LIKE '%API Connection Failure%'
  );
