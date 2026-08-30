import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifyWebhookSignature, storeWebhookEvent, markWebhookProcessed, resolveTenantFromPayload, storeEngagementItem, type ZernioWebhookPayload } from "@/lib/webhooks";
import { webhookEvents, flows, flowRuns } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { ExecuteOptions } from "@/lib/flows/executor";
import { executeAdmittedFlowRun } from "@/lib/flows/run-flow-server";

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

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("X-Zernio-Signature") ?? req.headers.get("X-Late-Signature");
    if (!signature) {
      return NextResponse.json({ error: "No signature provided" }, { status: 401 });
    }

    const secret = process.env.ZERNIO_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[webhooks/zernio] ZERNIO_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const rawBody = await req.text();

    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payload: ZernioWebhookPayload = JSON.parse(rawBody);

    const { event, isDuplicate } = await storeWebhookEvent(payload);
    if (isDuplicate || !event) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const attemptCreatedAt = event.createdAt;

    if (payload.event === "webhook.test") {
      return NextResponse.json({ received: true, message: "Webhook test successful" });
    }

    after(async () => {
      try {
        const tenantId = await resolveTenantFromPayload(payload);
        if (tenantId) {
          // Atomically claim the pending attempt to 'processing' and record tenantId.
          // If another callback or redelivery claimed or re-armed it, returning() is empty.
          const [claimed] = await db
            .update(webhookEvents)
            .set({ tenantId, status: "processing" })
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

          // Store engagement item for comment.received events
          if (payload.event === "comment.received") {
            await storeEngagementItem(payload, tenantId);
          }

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
    });

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[webhooks/zernio]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
