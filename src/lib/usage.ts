import { db } from "@/lib/db";
import { usageTracking, usageReservations, agentUsageEvents, agentConfigs } from "@/lib/db/schema";
import { eq, sql, and, desc, count } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
import { getModelCost } from "@/lib/models";
import { createHash } from "node:crypto";

// Rough cost models (USD per 1K tokens) used to estimate spend when the provider
// does not return a price. Tune these to match your actual model pricing.
const COST_PER_1K_INPUT = 0.0001; // Legacy callers without a model id only.
const COST_PER_1K_OUTPUT = 0.0006;

function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getOrCreateUsageRow(tenantId: string) {
  const periodStart = currentPeriodStart();
  let usage = await db.query.usageTracking.findFirst({
    where: eq(usageTracking.tenantId, tenantId),
  });

  // If the row belongs to a previous (or future) period, reset the counters so
  // usage stats always reflect the current month.
  if (usage && (usage.periodStart.getTime() !== periodStart.getTime())) {
    await db.update(usageTracking)
      .set({ periodStart, inputTokensUsed: 0, outputTokensUsed: 0, estimatedCostUsd: "0", reservedCostUsd: "0" })
      .where(and(eq(usageTracking.id, usage.id), eq(usageTracking.periodStart, usage.periodStart)));

    // Reset agent pause if it was caused by the billing cycle budget limit.
    // Preserves unrelated pauses (e.g. invalid API credentials or manual pauses).
    await db.update(agentConfigs)
      .set({ isPaused: false, pauseReason: null })
      .where(and(
        eq(agentConfigs.tenantId, tenantId),
        eq(agentConfigs.pauseReason, "budget_exceeded"),
      ));

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
      .onConflictDoNothing({ target: usageTracking.tenantId });
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
  modelId?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const usage = await getOrCreateUsageRow(tenantId);
    const addTokens = (modelId
      ? getModelCost(modelId, inputTokens, outputTokens)
      : (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT
    ).toFixed(8);

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

export type UsageKind = "text" | "image" | "transcription" | "embedding";

export class UsageBudgetExceededError extends Error {
  constructor(
    readonly spentUsd: number,
    readonly reservedUsd: number,
    readonly budgetUsd: number,
  ) {
    super(`Workspace AI budget reached ($${(spentUsd + reservedUsd).toFixed(2)} committed or reserved / $${budgetUsd.toFixed(2)}).`);
    this.name = "UsageBudgetExceededError";
  }
}

export class FreeTrialLimitReachedError extends Error {
  readonly code = "rate_limit:trial";
  constructor(
    readonly attemptsUsed: number,
    readonly maxAttempts: number = 3,
  ) {
    super(`Free AI trial limit reached (${attemptsUsed}/${maxAttempts} generations used). rate_limit:trial`);
    this.name = "FreeTrialLimitReachedError";
  }
}

/** Stable idempotency key for replayable framework lifecycle events. */
export function deterministicUsageReservationId(parts: readonly (string | number)[]) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

function validateMoney(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}.`);
  return value.toFixed(8);
}

function validateTokens(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid model usage counters.");
  return value;
}

/**
 * Atomically reserves part of a workspace's monthly budget before a provider
 * call. Locking the single usage row makes concurrent admission decisions see
 * each other's in-flight spend.
 */
export async function reserveUsageBudget(input: {
  id?: string;
  tenantId: string;
  kind: UsageKind;
  modelId?: string;
  estimatedCostUsd: number;
  metadata?: Record<string, unknown>;
}) {
  const id = input.id ?? crypto.randomUUID();
  const amount = validateMoney(input.estimatedCostUsd, "usage reservation");
  const periodStart = currentPeriodStart();

  return db.transaction(async (tx) => {
    await tx.insert(usageTracking).values({
      tenantId: input.tenantId,
      periodStart,
      inputTokensUsed: 0,
      outputTokensUsed: 0,
      estimatedCostUsd: "0",
      reservedCostUsd: "0",
      budgetLimitUsd: "5.00",
    }).onConflictDoNothing({ target: usageTracking.tenantId });

    let [usage] = await tx.select().from(usageTracking)
      .where(eq(usageTracking.tenantId, input.tenantId)).for("update");
    if (!usage) throw new Error("Could not initialize workspace usage accounting.");

    const [existing] = await tx.select().from(usageReservations)
      .where(eq(usageReservations.id, id)).limit(1);
    if (existing) {
      if (existing.tenantId !== input.tenantId) throw new Error("Usage reservation belongs to another workspace.");
      if (existing.status !== "reserved") throw new Error("Usage reservation was already finalized.");
      return existing;
    }

    if (usage.periodStart.getTime() !== periodStart.getTime()) {
      await tx.update(usageTracking).set({
        periodStart,
        inputTokensUsed: 0,
        outputTokensUsed: 0,
        estimatedCostUsd: "0",
        reservedCostUsd: "0",
      }).where(eq(usageTracking.id, usage.id));
      usage = { ...usage, periodStart, inputTokensUsed: 0, outputTokensUsed: 0, estimatedCostUsd: "0", reservedCostUsd: "0" };
    }

    const spent = Number(usage.estimatedCostUsd ?? 0);
    const reserved = Number(usage.reservedCostUsd ?? 0);
    const budget = usage.budgetLimitUsd === null ? Infinity : Number(usage.budgetLimitUsd);
    if (budget !== Infinity && spent + reserved + Number(amount) > budget) {
      throw new UsageBudgetExceededError(spent, reserved, budget);
    }

    const [reservation] = await tx.insert(usageReservations).values({
      id,
      tenantId: input.tenantId,
      kind: input.kind,
      modelId: input.modelId,
      periodStart,
      reservedCostUsd: amount,
      metadata: input.metadata,
    }).returning();
    await tx.update(usageTracking).set({
      reservedCostUsd: sql`${usageTracking.reservedCostUsd} + ${amount}::numeric`,
    }).where(eq(usageTracking.id, usage.id));
    return reservation;
  });
}

async function finalizeUsageReservation(input: {
  id: string;
  actualCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  status: "settled" | "released" | "failed";
  metadata?: Record<string, unknown>;
}) {
  const inputTokens = validateTokens(input.inputTokens ?? 0);
  const outputTokens = validateTokens(input.outputTokens ?? 0);
  const actual = validateMoney(input.actualCostUsd ?? 0, "actual usage cost");
  const nowPeriod = currentPeriodStart();

  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(usageReservations)
      .where(eq(usageReservations.id, input.id)).for("update");
    if (!reservation) throw new Error("Usage reservation was not found.");
    if (reservation.status !== "reserved") return reservation;

    let [usage] = await tx.select().from(usageTracking)
      .where(eq(usageTracking.tenantId, reservation.tenantId)).for("update");
    if (!usage) throw new Error("Workspace usage row was not found.");
    if (usage.periodStart.getTime() !== nowPeriod.getTime()) {
      await tx.update(usageTracking).set({
        periodStart: nowPeriod,
        inputTokensUsed: 0,
        outputTokensUsed: 0,
        estimatedCostUsd: "0",
        reservedCostUsd: "0",
      }).where(eq(usageTracking.id, usage.id));
      usage = { ...usage, periodStart: nowPeriod, inputTokensUsed: 0, outputTokensUsed: 0, estimatedCostUsd: "0", reservedCostUsd: "0" };
    }

    const shouldCharge = input.status !== "released";
    await tx.update(usageTracking).set({
      reservedCostUsd: sql`greatest(0, ${usageTracking.reservedCostUsd} - ${reservation.reservedCostUsd}::numeric)`,
      ...(shouldCharge ? {
        inputTokensUsed: sql`${usageTracking.inputTokensUsed} + ${inputTokens}`,
        outputTokensUsed: sql`${usageTracking.outputTokensUsed} + ${outputTokens}`,
        estimatedCostUsd: sql`${usageTracking.estimatedCostUsd} + ${actual}::numeric`,
      } : {}),
    }).where(eq(usageTracking.id, usage.id));

    if (shouldCharge) {
      await tx.insert(agentUsageEvents).values({
        id: reservation.id,
        tenantId: reservation.tenantId,
        inputTokens,
        outputTokens,
        costUsd: actual,
        kind: reservation.kind,
        modelId: reservation.modelId,
        metadata: { ...(reservation.metadata as Record<string, unknown> | null), ...input.metadata },
      }).onConflictDoNothing({ target: agentUsageEvents.id });
    }

    const [updated] = await tx.update(usageReservations).set({
      status: input.status,
      actualCostUsd: shouldCharge ? actual : null,
      inputTokens,
      outputTokens,
      metadata: { ...(reservation.metadata as Record<string, unknown> | null), ...input.metadata },
      updatedAt: new Date(),
    }).where(eq(usageReservations.id, reservation.id)).returning();
    return updated;
  });
}

export function settleUsageReservation(input: Omit<Parameters<typeof finalizeUsageReservation>[0], "status">) {
  return finalizeUsageReservation({ ...input, status: "settled" });
}

export function releaseUsageReservation(id: string, metadata?: Record<string, unknown>) {
  return finalizeUsageReservation({ id, status: "released", metadata });
}

/** Conservatively commits the admission estimate when provider outcome is ambiguous. */
export async function failUsageReservation(id: string, metadata?: Record<string, unknown>) {
  const reservation = await db.query.usageReservations.findFirst({ where: eq(usageReservations.id, id) });
  if (!reservation || reservation.status !== "reserved") return reservation;
  return finalizeUsageReservation({ id, status: "failed", actualCostUsd: Number(reservation.reservedCostUsd), metadata });
}

export async function findLatestUsageReservation(input: {
  tenantId: string;
  metadata: { sessionId: string; turnId: string; stepIndex: number; sequence: number };
}) {
  const rows = await db.query.usageReservations.findMany({
    where: and(eq(usageReservations.tenantId, input.tenantId), eq(usageReservations.status, "reserved")),
    orderBy: [desc(usageReservations.createdAt)],
    limit: 20,
  });
  return rows.find((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    return metadata?.sessionId === input.metadata.sessionId
      && metadata.turnId === input.metadata.turnId
      && metadata.stepIndex === input.metadata.stepIndex
      && metadata.sequence === input.metadata.sequence;
  });
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
  const reservedUsd = Number(usage.reservedCostUsd || 0);
  const budgetUsd = usage.budgetLimitUsd != null ? Number(usage.budgetLimitUsd) : Infinity;

  const allowed = budgetUsd === Infinity || costUsd + reservedUsd < budgetUsd;

  if (!allowed) {
    await db.update(agentConfigs)
      .set({ isPaused: true, pauseReason: "budget_exceeded" })
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

/**
 * Counts total AI generations consumed under the free trial for a tenant.
 */
export async function getTrialGenerationsUsed(tenantId: string): Promise<number> {
  const [eventsRes, reservationsRes] = await Promise.all([
    db
      .select({ total: count() })
      .from(agentUsageEvents)
      .where(and(eq(agentUsageEvents.tenantId, tenantId), eq(agentUsageEvents.kind, "text"))),
    db
      .select({ total: count() })
      .from(usageReservations)
      .where(and(
        eq(usageReservations.tenantId, tenantId),
        eq(usageReservations.kind, "text"),
        eq(usageReservations.status, "reserved"),
      )),
  ]);
  return (eventsRes?.[0]?.total ?? 0) + (reservationsRes?.[0]?.total ?? 0);
}

/**
 * Asserts that a free trial tenant has not exceeded the max allowed free attempts.
 */
export async function assertTrialQuota(tenantId: string, maxAttempts: number = 3): Promise<void> {
  const used = await getTrialGenerationsUsed(tenantId);
  if (used >= maxAttempts) {
    throw new FreeTrialLimitReachedError(used, maxAttempts);
  }
}
