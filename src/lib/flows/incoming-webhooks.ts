import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { flowRuns, flowWebhookDeliveries } from "@/lib/db/schema";
import { executeAdmittedFlowRun, type RunnableFlow } from "./run-flow-server";
import type { FlowStep } from "./types";

export const WEBHOOK_REQUEST_LIMIT_BYTES = 1024 * 1024;
export const WEBHOOK_STALE_AFTER_MS = 2 * 60_000;

export type DeliveryStatus = "processing" | "processed" | "failed";

export type ExistingDeliveryState = {
  status: string;
  updatedAt: Date;
  hasLiveRun: boolean;
};

export function mayRearmDelivery(
  delivery: ExistingDeliveryState,
  now = new Date(),
): boolean {
  if (delivery.status === "processed" || delivery.hasLiveRun) return false;
  if (delivery.status === "failed") return true;
  return (
    delivery.status === "processing" &&
    delivery.updatedAt.getTime() <= now.getTime() - WEBHOOK_STALE_AFTER_MS
  );
}

export function normalizeSenderDeliveryId(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("Delivery ID must contain 1-200 printable characters.");
  }
  return normalized;
}

/** Mirrors the partial database uniqueness boundary; null is never deduplicated. */
export function deliveryIdentityKey(
  tenantId: string,
  flowId: string,
  deliveryId: string | null,
): string | null {
  return deliveryId === null ? null : JSON.stringify([tenantId, flowId, deliveryId]);
}

type DeliveryAdmission =
  | { admitted: true; id: string; attempt: number }
  | { admitted: false; reason: "duplicate" | "active" };

async function hasLiveDeliveryRun(tenantId: string, flowId: string, deliveryRowId: string) {
  const run = await db.query.flowRuns.findFirst({
    where: and(
      eq(flowRuns.tenantId, tenantId),
      eq(flowRuns.flowId, flowId),
      eq(flowRuns.trigger, "webhook"),
      sql`${flowRuns.triggerPayload}->>'webhookDeliveryId' = ${deliveryRowId}`,
      sql`${flowRuns.status} IN ('running', 'waiting_approval')`,
    ),
    columns: { status: true, updatedAt: true },
    orderBy: [desc(flowRuns.startedAt)],
  });
  if (!run) return false;
  return (
    run.status === "waiting_approval" ||
    run.updatedAt.getTime() > Date.now() - WEBHOOK_STALE_AFTER_MS
  );
}

export async function admitWebhookDelivery(input: {
  tenantId: string;
  flowId: string;
  deliveryId: string | null;
  payload: Record<string, unknown>;
}): Promise<DeliveryAdmission> {
  const inserted = await db
    .insert(flowWebhookDeliveries)
    .values(input)
    .onConflictDoNothing()
    .returning({ id: flowWebhookDeliveries.id, attempt: flowWebhookDeliveries.attempt });
  if (inserted[0]) return { admitted: true, ...inserted[0] };

  // Only explicit sender identifiers can conflict. Null identifiers intentionally
  // create a new admission row for every request.
  if (!input.deliveryId) throw new Error("Webhook delivery admission failed.");
  const existing = await db.query.flowWebhookDeliveries.findFirst({
    where: and(
      eq(flowWebhookDeliveries.tenantId, input.tenantId),
      eq(flowWebhookDeliveries.flowId, input.flowId),
      eq(flowWebhookDeliveries.deliveryId, input.deliveryId),
    ),
  });
  if (!existing) throw new Error("Webhook delivery conflict could not be resolved.");

  const hasLiveRun = await hasLiveDeliveryRun(input.tenantId, input.flowId, existing.id);
  if (!mayRearmDelivery({ ...existing, hasLiveRun })) {
    return { admitted: false, reason: hasLiveRun ? "active" : "duplicate" };
  }

  const [claimed] = await db
    .update(flowWebhookDeliveries)
    .set({
      payload: input.payload,
      status: "processing",
      attempt: existing.attempt + 1,
      error: null,
      processedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(flowWebhookDeliveries.id, existing.id),
        eq(flowWebhookDeliveries.tenantId, input.tenantId),
        eq(flowWebhookDeliveries.flowId, input.flowId),
        eq(flowWebhookDeliveries.attempt, existing.attempt),
        eq(flowWebhookDeliveries.updatedAt, existing.updatedAt),
      ),
    )
    .returning({ id: flowWebhookDeliveries.id, attempt: flowWebhookDeliveries.attempt });
  return claimed
    ? { admitted: true, ...claimed }
    : { admitted: false, reason: "active" };
}

async function finishDelivery(
  tenantId: string,
  id: string,
  attempt: number,
  status: "processed" | "failed",
  error?: string,
) {
  await db
    .update(flowWebhookDeliveries)
    .set({
      status,
      error: error ?? null,
      processedAt: status === "processed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(flowWebhookDeliveries.id, id),
        eq(flowWebhookDeliveries.tenantId, tenantId),
        eq(flowWebhookDeliveries.attempt, attempt),
        eq(flowWebhookDeliveries.status, "processing"),
      ),
    );
}

export async function executeWebhookDelivery(input: {
  flow: RunnableFlow;
  deliveryRowId: string;
  senderDeliveryId: string | null;
  attempt: number;
  payload: Record<string, unknown>;
}): Promise<void> {
  const triggerPayload = {
    id: input.deliveryRowId,
    webhookDeliveryId: input.deliveryRowId,
    senderDeliveryId: input.senderDeliveryId,
    payload: input.payload,
  };
  try {
    const prior = await db.query.flowRuns.findFirst({
      where: and(
        eq(flowRuns.tenantId, input.flow.tenantId),
        eq(flowRuns.flowId, input.flow.id),
        eq(flowRuns.trigger, "webhook"),
        sql`${flowRuns.triggerPayload}->>'webhookDeliveryId' = ${input.deliveryRowId}`,
      ),
      orderBy: [desc(flowRuns.startedAt)],
    });
    if (prior?.status === "succeeded" || prior?.status === "waiting_approval") {
      await finishDelivery(input.flow.tenantId, input.deliveryRowId, input.attempt, "processed");
      return;
    }
    if (
      prior?.status === "running" &&
      prior.updatedAt.getTime() > Date.now() - WEBHOOK_STALE_AFTER_MS
    ) return;

    let supersededStaleRun = false;
    if (prior?.status === "running") {
      const superseded = await db
        .update(flowRuns)
        .set({
          status: "failed",
          error: "Superseded after its webhook execution lease expired.",
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(flowRuns.id, prior.id),
            eq(flowRuns.tenantId, input.flow.tenantId),
            eq(flowRuns.status, "running"),
            eq(flowRuns.updatedAt, prior.updatedAt),
          ),
        )
        .returning({ id: flowRuns.id });
      if (!superseded[0]) return;
      supersededStaleRun = true;
    }

    const canResume = prior?.status === "failed" || supersededStaleRun;
    const cachedSteps = canResume ? (prior?.steps as FlowStep[]) : undefined;
    const fanoutProgress = canResume
      ? (prior?.fanoutProgress as Record<string, Record<string, unknown>>)
      : undefined;
    const [run] = await db
      .insert(flowRuns)
      .values({
        flowId: input.flow.id,
        tenantId: input.flow.tenantId,
        trigger: "webhook",
        triggerPayload,
        steps: cachedSteps ?? [],
        fanoutProgress: fanoutProgress ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: flowRuns.id });
    if (!run) return;

    const result = await executeAdmittedFlowRun({
      flow: input.flow,
      runId: run.id,
      triggerPayload,
      cachedSteps,
      fanoutProgress,
    });
    if (result.status === "succeeded" || result.status === "waiting_approval") {
      await finishDelivery(input.flow.tenantId, input.deliveryRowId, input.attempt, "processed");
    } else {
      await finishDelivery(
        input.flow.tenantId,
        input.deliveryRowId,
        input.attempt,
        "failed",
        result.error ?? "Webhook flow execution failed.",
      );
    }
  } catch (error) {
    await finishDelivery(
      input.flow.tenantId,
      input.deliveryRowId,
      input.attempt,
      "failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}
