import { db } from "@/lib/db";
import { usageTracking, agentConfigs } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";

// Rough cost models (USD per 1K tokens) used to estimate spend when the provider
// does not return a price. Tune these to match your actual model pricing.
const COST_PER_1K_INPUT = 0.0001; // ~ gpt-4o-mini input
const COST_PER_1K_OUTPUT = 0.0006; // ~ gpt-4o-mini output

function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function getOrCreateUsageRow(tenantId: string) {
  const periodStart = currentPeriodStart();
  let usage = await db.query.usageTracking.findFirst({
    where: eq(usageTracking.tenantId, tenantId),
  });

  // If the row belongs to a previous (or future) period, reset the counters so
  // usage stats always reflect the current month.
  if (usage && (usage.periodStart.getTime() !== periodStart.getTime())) {
    await db.update(usageTracking)
      .set({ periodStart, inputTokensUsed: 0, outputTokensUsed: 0, estimatedCostUsd: "0" })
      .where(eq(usageTracking.id, usage.id));
    usage = await db.query.usageTracking.findFirst({ where: eq(usageTracking.tenantId, tenantId) });
  }

  if (!usage) {
    await db.insert(usageTracking).values({
      tenantId,
      periodStart,
      inputTokensUsed: 0,
      outputTokensUsed: 0,
      estimatedCostUsd: "0",
      budgetLimitUsd: "5.00",
    })
      .onConflictDoNothing();
    usage = await db.query.usageTracking.findFirst({ where: eq(usageTracking.tenantId, tenantId) });
  }

  return usage!;
}

/**
 * Records token usage for a tenant, incrementing the current-period counters and
 * estimated cost by the given amounts. Creates the row if it does not yet exist.
 */
export async function recordTokenUsage(
  tenantId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const usage = await getOrCreateUsageRow(tenantId);
    const costInput = (inputTokens / 1000) * COST_PER_1K_INPUT;
    const costOutput = (outputTokens / 1000) * COST_PER_1K_OUTPUT;
    const addTokens = (costInput + costOutput).toFixed(6);

    await db.update(usageTracking)
      .set({
        inputTokensUsed: sql`${usageTracking.inputTokensUsed} + ${inputTokens}`,
        outputTokensUsed: sql`${usageTracking.outputTokensUsed} + ${outputTokens}`,
        estimatedCostUsd: sql`(${usageTracking.estimatedCostUsd}::numeric + ${addTokens})`,
      })
      .where(eq(usageTracking.id, usage.id));

    return { ok: true };
  } catch (error) {
    console.error("Failed to record token usage:", error);
    return { ok: false, error: (error as Error).message };
  }
}

/**
 * Checks whether a tenant has exceeded its monthly LLM budget. When over budget,
 * pauses agent activity and notifies the user. Returns the usage snapshot.
 */
export async function assertBudget(
  tenantId: string,
): Promise<{ allowed: boolean; costUsd: number; budgetUsd: number }> {
  const usage = await getOrCreateUsageRow(tenantId);
  const costUsd = Number(usage.estimatedCostUsd || 0);
  const budgetUsd = usage.budgetLimitUsd != null ? Number(usage.budgetLimitUsd) : Infinity;

  const allowed = budgetUsd === Infinity || costUsd < budgetUsd;

  if (!allowed) {
    await db.update(agentConfigs)
      .set({ isPaused: true })
      .where(eq(agentConfigs.tenantId, tenantId));
    await createNotification(
      tenantId,
      "api_failure",
      "Monthly LLM Budget Reached",
      `Your estimated LLM spend of $${costUsd.toFixed(2)} has exceeded your $${budgetUsd.toFixed(2)} budget limit. Agent activity has been paused.`,
      { link: "/settings" },
    );
  }

  return { allowed, costUsd, budgetUsd };
}