import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getModelCost } from "@/lib/models";

/** Each measured model event is counted once; a retried model call is new spend. */
export async function recordAgentUsage(input: { eventId: string; tenantId: string; modelId?: string; inputTokens: number; outputTokens: number; costUsd?: number }) {
  const { eventId, tenantId, inputTokens, outputTokens } = input;
  if (![inputTokens, outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("Invalid model usage counters");
  const cost = input.costUsd ?? getModelCost(input.modelId || "", inputTokens, outputTokens);
  if (!Number.isFinite(cost) || cost < 0) throw new Error("Invalid model usage cost");
  const now = new Date();
  const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  await db.execute(sql`
    WITH measured AS (
      INSERT INTO agent_usage_events (id, tenant_id, input_tokens, output_tokens, cost_usd)
      VALUES (${eventId}, ${tenantId}, ${inputTokens}, ${outputTokens}, ${cost.toFixed(8)})
      ON CONFLICT (id) DO NOTHING RETURNING id
    )
    INSERT INTO usage_tracking (id, tenant_id, period_start, input_tokens_used, output_tokens_used, estimated_cost_usd, budget_limit_usd)
    SELECT ${crypto.randomUUID()}, ${tenantId}, ${period}::timestamp, ${inputTokens}, ${outputTokens}, ${cost.toFixed(8)}, 5 FROM measured
    ON CONFLICT (tenant_id) DO UPDATE SET
      input_tokens_used = CASE WHEN usage_tracking.period_start = EXCLUDED.period_start THEN COALESCE(usage_tracking.input_tokens_used, 0) ELSE 0 END + EXCLUDED.input_tokens_used,
      output_tokens_used = CASE WHEN usage_tracking.period_start = EXCLUDED.period_start THEN COALESCE(usage_tracking.output_tokens_used, 0) ELSE 0 END + EXCLUDED.output_tokens_used,
      estimated_cost_usd = CASE WHEN usage_tracking.period_start = EXCLUDED.period_start THEN COALESCE(usage_tracking.estimated_cost_usd, 0) ELSE 0 END + EXCLUDED.estimated_cost_usd,
      period_start = EXCLUDED.period_start
  `);
}
