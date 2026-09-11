import { markWebhookProcessed, resolveTenantFromPayload, type ZernioWebhookPayload } from "@/lib/webhooks";
import { ingestZernioEngagementEvent, ZERNIO_ENGAGEMENT_EVENTS } from "@/lib/engagement-inbox";
import { webhookEvents, flows, flowRuns } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { ExecuteOptions } from "@/lib/flows/executor";
import { executeAdmittedFlowRun } from "@/lib/flows/run-flow-server";
import { reconcileThemePackagePostEvent } from "@/lib/theme-studio/publishing/reconcile-post-event";
import { reconcileDraftPostEvent } from "@/lib/reconcile-draft-post";

/** Starts every active flow whose trigger.webhook matches the event. */
async function dispatchFlowWebhooks(
  tenantId: string,
  eventName: string,
  payload: unknown,
  attemptCreatedAt?: Date,
): Promise<{ hasFailures: boolean; errors: string[] }> {
  const activeFlows = await db.query.flows.findMany({
    where: and(eq(flows.tenantId, tenantId), eq(flows.status, "active")),
  });

  let hasFailures = false;
  const errors: string[] = [];

  for (const flow of activeFlows) {
    const graph = flow.graph as { nodes?: { id: string; type: string; config?: Record<string, unknown> }[] };
    const trigger = graph.nodes?.find((n) => n.type === "trigger.webhook");
    if (!trigger) continue;
    if (trigger.config?.eventName !== eventName) continue;

    try {
      // If this webhook event is being retried after a previous run on this flow failed,
      // reuse the prior run's completed step/fan-out checkpoints so successful side-effects
      // are not repeated.
      const payloadId = (payload as Record<string, unknown> | null)?.id;

      // If this callback attempt is superseded by a subsequent redelivery, abort dispatch
      if (attemptCreatedAt && payloadId) {
        const stillActive = await db.query.webhookEvents.findFirst({
          where: and(
            eq(webhookEvents.eventId, String(payloadId)),
            eq(webhookEvents.createdAt, attemptCreatedAt),
            eq(webhookEvents.status, "processing"),
          ),
        });
        if (!stillActive) {
          console.warn(`[webhooks/zernio] Aborting flow ${flow.id} dispatch for superseded attempt`);
          break;
        }
      }

      const priorRun = payloadId
        ? await db.query.flowRuns.findFirst({
            where: and(
              eq(flowRuns.flowId, flow.id),
              eq(flowRuns.tenantId, tenantId),
              eq(flowRuns.trigger, "webhook"),
              sql`${flowRuns.triggerPayload}->>'id' = ${String(payloadId)}`,
            ),
            orderBy: (runs, { desc }) => [desc(runs.startedAt)],
          })
        : undefined;

      // If the prior run already succeeded or is waiting approval, skip to avoid duplicate work.
      if (priorRun && (priorRun.status === "succeeded" || priorRun.status === "waiting_approval")) {
        continue;
      }

      // If prior run is actively running with live heartbeats, skip to avoid duplicate concurrent execution.
      if (
        priorRun &&
        priorRun.status === "running" &&
        priorRun.updatedAt &&
        new Date(priorRun.updatedAt).getTime() > Date.now() - 2 * 60_000
      ) {
        continue;
      }

      // If prior run was interrupted/abandoned without heartbeat for >2m, mark it superseded
      if (priorRun && priorRun.status === "running") {
        await db
          .update(flowRuns)
          .set({
            status: "failed",
            error: "Interrupted by webhook redelivery / retry.",
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(flowRuns.id, priorRun.id), eq(flowRuns.status, "running")));
      }

      const cachedSteps =
        priorRun && (priorRun.status === "failed" || priorRun.status === "running") && Array.isArray(priorRun.steps)
          ? (priorRun.steps as ExecuteOptions["cachedSteps"])
          : undefined;

      const fanoutProgress =
        priorRun && (priorRun.status === "failed" || priorRun.status === "running") && priorRun.fanoutProgress
          ? (priorRun.fanoutProgress as ExecuteOptions["fanoutProgress"])
          : undefined;

      const [run] = await db
        .insert(flowRuns)
        .values({
          flowId: flow.id,
          tenantId,
          trigger: "webhook",
          triggerPayload: payload as object,
          ...(cachedSteps ? { steps: cachedSteps } : {}),
          ...(fanoutProgress ? { fanoutProgress } : {}),
        })
        .onConflictDoNothing()
        .returning();

      if (!run) {
        // Another concurrent callback or retry already claimed and created the active run for this flow and event
        console.warn(`[webhooks/zernio] Active flow run already exists for flow ${flow.id} and event ${String(payloadId)}, skipping duplicate`);
        continue;
      }

      const execution = await executeAdmittedFlowRun({
        flow,
        runId: run.id,
        triggerPayload: payload,
        cachedSteps,
        fanoutProgress,
      });
      const status = execution.status;
      const errorMsg = execution.error ?? null;

      if (status === "failed") {
        hasFailures = true;
        if (errorMsg) errors.push(errorMsg);
      }

      if (!execution.persisted) {
        hasFailures = true;
        errors.push(execution.error ?? "Flow terminal state could not be persisted.");
      }
    } catch (err) {
      hasFailures = true;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      console.error(`[webhooks/zernio] Flow ${flow.id} failed on ${eventName}:`, err);
    }
  }

  return { hasFailures, errors };
}

export async function processZernioWebhookEvent(payload: ZernioWebhookPayload, attemptCreatedAt: Date) {
      if (payload.event === "webhook.test") {
        await markWebhookProcessed(payload.id, undefined, attemptCreatedAt);
        return;
      }
      try {
        const tenantId = await resolveTenantFromPayload(payload);
        if (tenantId) {
          // Atomically claim the pending attempt to 'processing' and record tenantId.
          // If another callback or redelivery claimed or re-armed it, returning() is empty.
          const [claimed] = await db
            .update(webhookEvents)
            .set({ tenantId, status: "processing", attemptCount: sql`${webhookEvents.attemptCount} + 1`, updatedAt: new Date() })
            .where(
              and(
                eq(webhookEvents.eventId, payload.id),
                eq(webhookEvents.createdAt, attemptCreatedAt),
                eq(webhookEvents.status, "pending"),
              ),
            )
            .returning();

          if (!claimed) {
            console.warn(`[webhooks/zernio] Aborting stale attempt for event ${payload.id} (superseded by redelivery)`);
            return;
          }

          if (ZERNIO_ENGAGEMENT_EVENTS.has(payload.event)) {
            await ingestZernioEngagementEvent(payload, tenantId);
          }
          await reconcileThemePackagePostEvent(payload, tenantId);
          await reconcileDraftPostEvent(payload, tenantId);

          // Fan out to active flows listening for this event
          const { hasFailures, errors } = await dispatchFlowWebhooks(tenantId, payload.event, payload, attemptCreatedAt);

          if (hasFailures) {
            await markWebhookProcessed(
              payload.id,
              errors.join("; ") || "One or more flow runs failed.",
              attemptCreatedAt,
            );
          } else {
            await markWebhookProcessed(payload.id, undefined, attemptCreatedAt);
          }
        } else {
          await db.update(webhookEvents).set({ attemptCount: sql`${webhookEvents.attemptCount} + 1` }).where(and(eq(webhookEvents.eventId, payload.id), eq(webhookEvents.createdAt, attemptCreatedAt)));
          await markWebhookProcessed(payload.id, "No tenant resolved", attemptCreatedAt);
        }
      } catch (err) {
        console.error(`[webhooks/zernio] Failed to process event ${payload.id}:`, err);
        await markWebhookProcessed(
          payload.id,
          err instanceof Error ? err.message : "Unknown error",
          attemptCreatedAt,
        );
      }
}

/** Recover acknowledged deliveries if the post-response worker failed or died. */
export async function recoverZernioWebhookEvents(limit = 5): Promise<number> {
  const batchSize = Number.isFinite(limit) ? Math.min(20, Math.max(1, Math.trunc(limit))) : 5;
  // Millisecond timestamps round-trip through JS Dates and serve as attempt fences.
  const attemptAt = new Date();
  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT we.id FROM webhook_events we
      WHERE we.attempt_count < 8
        AND we.payload->>'event' IS NOT NULL
        AND (
          (we.status = 'failed' AND we.updated_at < now() - LEAST(3600, 30 * power(2, we.attempt_count)) * interval '1 second')
          OR (we.status IN ('pending', 'processing') AND we.updated_at < now() - interval '5 minutes')
        )
        AND NOT EXISTS (
          SELECT 1 FROM flow_runs fr WHERE fr.trigger = 'webhook'
            AND fr.trigger_payload->>'id' = we.event_id
            AND fr.status = 'running' AND fr.updated_at > now() - interval '2 minutes'
        )
      ORDER BY we.updated_at, we.id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
    )
    UPDATE webhook_events we SET status = 'pending', created_at = ${attemptAt.toISOString()}::timestamp,
      updated_at = ${attemptAt.toISOString()}::timestamp, processed_at = NULL, error_message = NULL
    FROM candidates c WHERE we.id = c.id RETURNING we.payload
  `);
  const rows = Array.isArray(result) ? result : (result as { rows?: Array<{ payload: unknown }> }).rows || [];
  for (const row of rows) {
    await processZernioWebhookEvent(row.payload as ZernioWebhookPayload, attemptAt);
  }
  return rows.length;
}
