import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { flows, flowRuns, flowWebhookDeliveries } from "@/lib/db/schema";
import { executeAdmittedFlowRun } from "./run-flow-server";
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
  return db.transaction(async (tx): Promise<DeliveryAdmission> => {
    const existing = await tx.query.flowWebhookDeliveries.findFirst({
      where: and(
        eq(flowWebhookDeliveries.tenantId, input.tenantId),
        eq(flowWebhookDeliveries.flowId, input.flowId),
        eq(flowWebhookDeliveries.deliveryId, input.deliveryId!),
      ),
    });
    if (!existing) throw new Error("Webhook delivery conflict could not be resolved.");

    const priorRun = await tx.query.flowRuns.findFirst({
      where: and(
        eq(flowRuns.tenantId, input.tenantId),
        eq(flowRuns.flowId, input.flowId),
        eq(flowRuns.trigger, "webhook"),
        sql`${flowRuns.triggerPayload}->>'webhookDeliveryId' = ${existing.id}`,
      ),
      orderBy: [desc(flowRuns.startedAt)],
    });
    if (priorRun?.status === "succeeded" || priorRun?.status === "waiting_approval") {
      await tx
        .update(flowWebhookDeliveries)
        .set({ status: "processed", processedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(flowWebhookDeliveries.id, existing.id),
          eq(flowWebhookDeliveries.attempt, existing.attempt),
        ));
      return { admitted: false, reason: "duplicate" };
    }

    if (priorRun?.status === "running") {
      const staleBefore = new Date(Date.now() - WEBHOOK_STALE_AFTER_MS);
      if (priorRun.updatedAt > staleBefore) return { admitted: false, reason: "active" };
      const [superseded] = await tx
        .update(flowRuns)
        .set({
          status: "failed",
          error: "Superseded after its webhook execution lease expired.",
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(flowRuns.id, priorRun.id),
          eq(flowRuns.tenantId, input.tenantId),
          eq(flowRuns.status, "running"),
          eq(flowRuns.updatedAt, priorRun.updatedAt),
        ))
        .returning({ id: flowRuns.id });
      // A resumed heartbeat changed the lease first. Do not increment the
      // delivery attempt because that run still owns the current attempt.
      if (!superseded) return { admitted: false, reason: "active" };
    }

    if (!mayRearmDelivery({ ...existing, hasLiveRun: false })) {
      return { admitted: false, reason: "duplicate" };
    }
    const [claimed] = await tx
      .update(flowWebhookDeliveries)
      .set({
        payload: input.payload,
        status: "processing",
        attempt: existing.attempt + 1,
        error: null,
        processedAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(flowWebhookDeliveries.id, existing.id),
        eq(flowWebhookDeliveries.tenantId, input.tenantId),
        eq(flowWebhookDeliveries.flowId, input.flowId),
        eq(flowWebhookDeliveries.attempt, existing.attempt),
        eq(flowWebhookDeliveries.updatedAt, existing.updatedAt),
      ))
      .returning({ id: flowWebhookDeliveries.id, attempt: flowWebhookDeliveries.attempt });
    return claimed
      ? { admitted: true, ...claimed }
      : { admitted: false, reason: "active" };
  });
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
  tenantId: string;
  flowId: string;
  deliveryRowId: string;
  senderDeliveryId: string | null;
  attempt: number;
  payload: Record<string, unknown>;
}): Promise<void> {
  const triggerPayload = {
    id: input.deliveryRowId,
    webhookDeliveryId: input.deliveryRowId,
    webhookDeliveryAttempt: input.attempt,
    senderDeliveryId: input.senderDeliveryId,
    payload: input.payload,
  };
  try {
    const claim = await db.transaction(async (tx) => {
      // This conditional write both validates the attempt and locks its delivery
      // row until run admission commits. A stale callback and a re-arm therefore
      // cannot cross between attempt validation and run creation.
      const [owned] = await tx
        .update(flowWebhookDeliveries)
        .set({ updatedAt: new Date() })
        .where(and(
          eq(flowWebhookDeliveries.id, input.deliveryRowId),
          eq(flowWebhookDeliveries.tenantId, input.tenantId),
          eq(flowWebhookDeliveries.flowId, input.flowId),
          eq(flowWebhookDeliveries.attempt, input.attempt),
          eq(flowWebhookDeliveries.status, "processing"),
        ))
        .returning({ id: flowWebhookDeliveries.id });
      if (!owned) return { kind: "obsolete" as const };

      // Deferred work uses the current status and graph, not the route's snapshot.
      const flow = await tx.query.flows.findFirst({
        where: and(
          eq(flows.id, input.flowId),
          eq(flows.tenantId, input.tenantId),
          eq(flows.status, "active"),
        ),
      });
      const graph = flow?.graph as { nodes?: Array<{ type?: string }> } | undefined;
      if (!flow || !graph?.nodes?.some((node) => node.type === "trigger.incoming_webhook")) {
        return { kind: "inactive" as const };
      }

      const prior = await tx.query.flowRuns.findFirst({
        where: and(
          eq(flowRuns.tenantId, input.tenantId),
          eq(flowRuns.flowId, input.flowId),
          eq(flowRuns.trigger, "webhook"),
          sql`${flowRuns.triggerPayload}->>'webhookDeliveryId' = ${input.deliveryRowId}`,
        ),
        orderBy: [desc(flowRuns.startedAt)],
      });
      if (prior?.status === "succeeded" || prior?.status === "waiting_approval") {
        return { kind: "complete" as const };
      }
      let resumable = prior?.status === "failed";
      if (prior?.status === "running") {
        const staleBefore = new Date(Date.now() - WEBHOOK_STALE_AFTER_MS);
        if (prior.updatedAt > staleBefore) return { kind: "active" as const };
        const [superseded] = await tx
          .update(flowRuns)
          .set({
            status: "failed",
            error: "Superseded by its current webhook delivery attempt after lease expiry.",
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(flowRuns.id, prior.id),
            eq(flowRuns.tenantId, input.tenantId),
            eq(flowRuns.status, "running"),
            eq(flowRuns.updatedAt, prior.updatedAt),
          ))
          .returning({ id: flowRuns.id });
        if (!superseded) return { kind: "active" as const };
        resumable = true;
      }

      const cachedSteps = resumable ? (prior?.steps as FlowStep[]) : undefined;
      const fanoutProgress = resumable
        ? (prior?.fanoutProgress as Record<string, Record<string, unknown>>)
        : undefined;
      const [run] = await tx
        .insert(flowRuns)
        .values({
          flowId: input.flowId,
          tenantId: input.tenantId,
          trigger: "webhook",
          triggerPayload,
          steps: cachedSteps ?? [],
          fanoutProgress: fanoutProgress ?? {},
        })
        .onConflictDoNothing()
        .returning({ id: flowRuns.id });
      return run
        ? { kind: "claimed" as const, flow, runId: run.id, cachedSteps, fanoutProgress }
        : { kind: "active" as const };
    });

    if (claim.kind === "obsolete" || claim.kind === "active") return;
    if (claim.kind === "inactive") {
      await finishDelivery(
        input.tenantId,
        input.deliveryRowId,
        input.attempt,
        "failed",
        "Flow was paused, removed, or no longer has an incoming webhook trigger.",
      );
      return;
    }
    if (claim.kind === "complete") {
      await finishDelivery(input.tenantId, input.deliveryRowId, input.attempt, "processed");
      return;
    }

    const result = await executeAdmittedFlowRun({
      flow: claim.flow,
      runId: claim.runId,
      flowRevision: claim.flow.executionRevision,
      triggerPayload,
      cachedSteps: claim.cachedSteps,
      fanoutProgress: claim.fanoutProgress,
    });
    if (result.status === "succeeded" || result.status === "waiting_approval") {
      await finishDelivery(input.tenantId, input.deliveryRowId, input.attempt, "processed");
    } else {
      await finishDelivery(
        input.tenantId,
        input.deliveryRowId,
        input.attempt,
        "failed",
        result.error ?? "Webhook flow execution failed.",
      );
    }
  } catch (error) {
    await finishDelivery(
      input.tenantId,
      input.deliveryRowId,
      input.attempt,
      "failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}
