import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifyWebhookSignature, storeWebhookEvent, markWebhookProcessed, resolveTenantFromPayload, storeEngagementItem, type ZernioWebhookPayload } from "@/lib/webhooks";
import { webhookEvents, flows, flowRuns } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { executeFlow } from "@/lib/flows/executor";

/** Starts every active flow whose trigger.webhook matches the event. */
async function dispatchFlowWebhooks(
  tenantId: string,
  eventName: string,
  payload: unknown,
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

      // If prior run was interrupted while still running, mark it superseded
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
          ? (priorRun.steps as Parameters<typeof executeFlow>[1]["cachedSteps"])
          : undefined;

      const fanoutProgress =
        priorRun && (priorRun.status === "failed" || priorRun.status === "running") && priorRun.fanoutProgress
          ? (priorRun.fanoutProgress as Parameters<typeof executeFlow>[1]["fanoutProgress"])
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
        .returning();

      let result;
      let execErr;
      try {
        result = await executeFlow(
          flow.graph as Parameters<typeof executeFlow>[0],
          {
            tenantId,
            runId: run.id,
            flowId: flow.id,
            triggerPayload: payload,
            cachedSteps,
            fanoutProgress,
          },
          {
            onStepUpdate: async (step) => {
              const r = await db.query.flowRuns.findFirst({
                where: and(eq(flowRuns.id, run.id), eq(flowRuns.tenantId, tenantId)),
                columns: { steps: true },
              });
              if (!r) return;
              const steps = ((r.steps as unknown[]) ?? []) as typeof step[];
              const idx = steps.findIndex((s) => s.nodeId === step.nodeId);
              if (idx >= 0) steps[idx] = step;
              else steps.push(step);
              await db
                .update(flowRuns)
                .set({ steps, updatedAt: new Date() })
                .where(and(eq(flowRuns.id, run.id), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
            },
            onHeartbeat: async () => {
              await db
                .update(flowRuns)
                .set({ updatedAt: new Date() })
                .where(and(eq(flowRuns.id, run.id), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
            },
            onFanoutProgress: async (fanoutProgress) => {
              await db
                .update(flowRuns)
                .set({ fanoutProgress, updatedAt: new Date() })
                .where(and(eq(flowRuns.id, run.id), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
            },
          },
        );
      } catch (err) {
        execErr = err;
      }

      const status = result ? result.status : "failed";
      const errorMsg = result?.error ?? (execErr instanceof Error ? execErr.message : (execErr ? String(execErr) : null));

      if (status === "failed") {
        hasFailures = true;
        if (errorMsg) errors.push(errorMsg);
      }

      try {
        await db
          .update(flowRuns)
          .set({
            status,
            ...(result?.steps ? { steps: result.steps } : {}),
            error: errorMsg,
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(flowRuns.id, run.id), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
      } catch (finErr) {
        console.warn(`[webhooks/zernio] Rich finalization failed for ${run.id}, applying fallback:`, finErr);
        try {
          await db
            .update(flowRuns)
            .set({
              status,
              error: errorMsg ?? "Failed persisting step output details.",
              finishedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(flowRuns.id, run.id), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running")));
        } catch (fallbackErr) {
          console.error(`[webhooks/zernio] CRITICAL: Fallback finalization failed for ${run.id}:`, fallbackErr);
        }
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

    const { isDuplicate } = await storeWebhookEvent(payload);
    if (isDuplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (payload.event === "webhook.test") {
      return NextResponse.json({ received: true, message: "Webhook test successful" });
    }

    after(async () => {
      try {
        const tenantId = await resolveTenantFromPayload(payload);
        if (tenantId) {
          await db.update(webhookEvents)
            .set({ tenantId })
            .where(eq(webhookEvents.eventId, payload.id));

          // Store engagement item for comment.received events
          if (payload.event === "comment.received") {
            await storeEngagementItem(payload, tenantId);
          }

          // Fan out to active flows listening for this event
          const { hasFailures, errors } = await dispatchFlowWebhooks(tenantId, payload.event, payload);

          if (hasFailures) {
            await markWebhookProcessed(payload.id, errors.join("; ") || "One or more flow runs failed.");
          } else {
            await markWebhookProcessed(payload.id);
          }
        } else {
          await markWebhookProcessed(payload.id, "No tenant resolved");
        }
      } catch (err) {
        console.error(`[webhooks/zernio] Failed to process event ${payload.id}:`, err);
        await markWebhookProcessed(payload.id, err instanceof Error ? err.message : "Unknown error");
      }
    });

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[webhooks/zernio]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
