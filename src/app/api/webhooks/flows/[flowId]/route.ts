import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flows, flowRuns } from "@/lib/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { startFlowRun } from "@/lib/flows/run-flow-server";
import { hashWebhookSecret, isHashedWebhookSecret, verifyWebhookSecret } from "@/lib/flows/webhook-secret";
import { randomUUID } from "node:crypto";

/**
 * Per-flow inbound webhook: POST /api/webhooks/flows/<flowId> with an
 * X-Webhook-Secret header. Starts the flow when it is active and its
 * graph contains a trigger.incoming_webhook node.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ flowId: string }> },
) {
  try {
    const { flowId } = await ctx.params;
    const secret = req.headers.get("x-webhook-secret");

    const flow = await db.query.flows.findFirst({
      where: eq(flows.id, flowId),
    });
    if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    if (!verifyWebhookSecret(secret, flow.webhookSecret)) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }
    const storedSecret = flow.webhookSecret;
    if (!isHashedWebhookSecret(storedSecret)) {
      if (!storedSecret) return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
      // Compare-and-swap prevents a stale legacy request from restoring a
      // credential that was rotated after this request read the flow.
      const upgraded = await db
        .update(flows)
        .set({ webhookSecret: hashWebhookSecret(secret!), updatedAt: new Date() })
        .where(and(eq(flows.id, flow.id), eq(flows.webhookSecret, storedSecret)))
        .returning({ id: flows.id });
      if (upgraded.length === 0) {
        return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
      }
    }
    if (flow.status !== "active") {
      return NextResponse.json({ error: "Flow is not active" }, { status: 409 });
    }

    const graph = flow.graph as { nodes?: { type: string }[] };
    if (!graph.nodes?.some((n) => n.type === "trigger.incoming_webhook")) {
      return NextResponse.json(
        { error: "Flow does not contain an Incoming webhook trigger" },
        { status: 400 },
      );
    }

    const rawBody = await req.text();
    let payload: unknown = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = rawBody;
    }

    const explicitId =
      req.headers.get("x-webhook-id") ||
      req.headers.get("x-request-id") ||
      req.headers.get("x-idempotency-key") ||
      req.headers.get("x-event-id") ||
      req.headers.get("x-delivery") ||
      req.headers.get("x-github-delivery") ||
      req.headers.get("x-amzn-trace-id") ||
      (payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).id ||
          (payload as Record<string, unknown>).event_id ||
          (payload as Record<string, unknown>).eventId ||
          (payload as Record<string, unknown>).delivery_id ||
          (payload as Record<string, unknown>).deliveryId
        : null);

    // A sender that supplies a delivery ID gets exactly-once admission. Without
    // one, this endpoint deliberately preserves at-least-once delivery: identical
    // payloads can be distinct real events, so a body hash is not a safe key.
    const effectiveId = explicitId ? String(explicitId) : randomUUID();

    const webhookEventId = `flow:${flowId}:${effectiveId}`;
    const { storeWebhookEvent, markWebhookProcessed } = await import("@/lib/webhooks");
    const { isDuplicate, event } = await storeWebhookEvent({
      id: webhookEventId,
      event: "flow.incoming_webhook",
      timestamp: new Date().toISOString(),
      flowId,
      data: payload,
    });

    if (isDuplicate) {
      return NextResponse.json({ received: true, deduplicated: true });
    }

    try {
      let cachedSteps: Parameters<typeof startFlowRun>[0]["cachedSteps"];
      let fanoutProgress: Parameters<typeof startFlowRun>[0]["fanoutProgress"];
      const priorRun = await db.query.flowRuns.findFirst({
        where: and(
          eq(flowRuns.flowId, flow.id),
          eq(flowRuns.tenantId, flow.tenantId),
          eq(flowRuns.trigger, "webhook"),
          sql`${flowRuns.triggerPayload}->>'id' = ${effectiveId}`,
        ),
        orderBy: (runs, { desc }) => [desc(runs.startedAt)],
      });
      if (priorRun?.status === "succeeded" || priorRun?.status === "waiting_approval") {
        return NextResponse.json({ received: true, deduplicated: true, runId: priorRun.id, status: priorRun.status });
      }
      if (priorRun?.status === "running") {
        const staleCutoff = new Date(Date.now() - 30 * 60_000);
        if (priorRun.updatedAt >= staleCutoff) {
          return NextResponse.json({ received: true, deduplicated: true, runId: priorRun.id, status: priorRun.status });
        }
        const superseded = await db
          .update(flowRuns)
          .set({ status: "failed", error: "Superseded by stale webhook recovery.", finishedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(flowRuns.id, priorRun.id), eq(flowRuns.status, "running"), lt(flowRuns.updatedAt, staleCutoff)))
          .returning({ id: flowRuns.id });
        if (superseded.length === 0) {
          return NextResponse.json({ received: true, deduplicated: true, runId: priorRun.id, status: "running" });
        }
      }
      if (priorRun && Array.isArray(priorRun.steps)) cachedSteps = priorRun.steps as Parameters<typeof startFlowRun>[0]["cachedSteps"];
      if (priorRun?.fanoutProgress) fanoutProgress = priorRun.fanoutProgress as Parameters<typeof startFlowRun>[0]["fanoutProgress"];
      const result = await startFlowRun({
        flow,
        trigger: "webhook",
        cachedSteps,
        fanoutProgress,
        triggerPayload:
          typeof payload === "object" && payload !== null
            ? { ...payload, id: effectiveId, webhookEventId }
            : { payload, id: effectiveId, webhookEventId },
      });

      await markWebhookProcessed(webhookEventId, result.status === "failed" ? "Flow execution failed" : undefined, event?.createdAt);
      return NextResponse.json({ received: true, runId: result.runId, status: result.status });
    } catch (err: any) {
      await markWebhookProcessed(webhookEventId, err?.message || "Flow execution threw an error", event?.createdAt);
      throw err;
    }
  } catch (error) {
    console.error("[webhooks/flows]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
