import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifyWebhookSignature, storeWebhookEvent, markWebhookProcessed, resolveTenantFromPayload, storeEngagementItem, type ZernioWebhookPayload } from "@/lib/webhooks";
import { webhookEvents, flows, flowRuns } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { executeFlow } from "@/lib/flows/executor";

/** Starts every active flow whose trigger.webhook matches the event. */
async function dispatchFlowWebhooks(tenantId: string, eventName: string, payload: unknown) {
  const activeFlows = await db.query.flows.findMany({
    where: and(eq(flows.tenantId, tenantId), eq(flows.status, "active")),
  });

  for (const flow of activeFlows) {
    const graph = flow.graph as { nodes?: { id: string; type: string; config?: Record<string, unknown> }[] };
    const trigger = graph.nodes?.find((n) => n.type === "trigger.webhook");
    if (!trigger) continue;
    if (trigger.config?.eventName !== eventName) continue;

    try {
      const [run] = await db
        .insert(flowRuns)
        .values({ flowId: flow.id, tenantId, trigger: "webhook", triggerPayload: payload as object })
        .returning();

      const result = await executeFlow(
        flow.graph as Parameters<typeof executeFlow>[0],
        { tenantId, runId: run.id, flowId: flow.id, triggerPayload: payload },
        {
          onStepUpdate: async (step) => {
            const r = await db.query.flowRuns.findFirst({
              where: eq(flowRuns.id, run.id),
              columns: { steps: true },
            });
            if (!r) return;
            const steps = ((r.steps as unknown[]) ?? []) as typeof step[];
            const idx = steps.findIndex((s) => s.nodeId === step.nodeId);
            if (idx >= 0) steps[idx] = step;
            else steps.push(step);
            await db.update(flowRuns).set({ steps }).where(eq(flowRuns.id, run.id));
          },
        },
      );

      await db
        .update(flowRuns)
        .set({
          status: result.status,
          steps: result.steps,
          error: result.error ?? null,
          finishedAt: new Date(),
        })
        .where(eq(flowRuns.id, run.id));
    } catch (err) {
      console.error(`[webhooks/zernio] Flow ${flow.id} failed on ${eventName}:`, err);
    }
  }
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

    const event = await storeWebhookEvent(payload);

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
          await dispatchFlowWebhooks(tenantId, payload.event, payload);

          await markWebhookProcessed(payload.id);
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
