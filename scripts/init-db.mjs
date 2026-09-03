import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log("No DATABASE_URL provided, skipping vector extension initialization.");
  process.exit(0);
}

const sql = postgres(connectionString, { max: 1 });

try {
  await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
  await sql`ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS pause_reason text;`;
  await sql`
    UPDATE agent_configs ac
    SET pause_reason = 'api_failure'
    WHERE ac.is_paused = true
      AND ac.pause_reason IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM api_keys k
          WHERE k.tenant_id = ac.tenant_id
            AND k.provider = 'zernio'
            AND k.status = 'revoked'
        )
        OR NOT EXISTS (
          SELECT 1 FROM api_keys k
          WHERE k.tenant_id = ac.tenant_id
            AND k.provider = 'zernio'
            AND k.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM drafts d
          WHERE d.tenant_id = ac.tenant_id
            AND d.status = 'failed'
            AND d.error_message LIKE '%API Connection Failure%'
        )
      );
  `;
  await sql`
    UPDATE agent_configs ac
    SET pause_reason = 'budget_exceeded'
    FROM usage_tracking ut
    WHERE ac.tenant_id = ut.tenant_id
      AND ac.is_paused = true
      AND ac.pause_reason IS NULL
      AND ut.estimated_cost_usd >= ut.budget_limit_usd
      AND EXISTS (
        SELECT 1 FROM api_keys k
        WHERE k.tenant_id = ac.tenant_id
          AND k.provider = 'zernio'
          AND k.status = 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM drafts d
        WHERE d.tenant_id = ac.tenant_id
          AND d.status = 'failed'
          AND d.error_message LIKE '%API Connection Failure%'
      );
  `;
  console.log("Successfully verified/initialized PostgreSQL vector extension and agent_configs schema.");
} catch (err) {
  console.warn("Warning: Unable to create vector extension directly:", err.message);
} finally {
  await sql.end();
}
