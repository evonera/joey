import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { startFlowRun } from "@/lib/flows/run-flow-server";

/**
 * Per-flow inbound webhook: POST /api/webhooks/flows/<flowId>?secret=<secret>
 * (or X-Webhook-Secret header). Starts the flow when it is active and its
 * graph contains a trigger.incoming_webhook node.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ flowId: string }> },
) {
  try {
    const { flowId } = await ctx.params;
    const secret =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-webhook-secret");

    const flow = await db.query.flows.findFirst({
      where: eq(flows.id, flowId),
    });
    if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    if (!flow.webhookSecret || secret !== flow.webhookSecret) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
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

    if (explicitId) {
      const { storeWebhookEvent, markWebhookProcessed } = await import("@/lib/webhooks");
      const { isDuplicate, event } = await storeWebhookEvent({
        id: explicitId,
        event: "flow.incoming_webhook",
        timestamp: new Date().toISOString(),
        flowId,
        data: payload,
      });

      if (isDuplicate) {
        return NextResponse.json({ received: true, deduplicated: true });
      }

      try {
        const result = await startFlowRun({
          flow,
          trigger: "webhook",
          triggerPayload: payload,
        });

        await markWebhookProcessed(explicitId, result.status === "failed" ? "Flow execution failed" : undefined, event?.createdAt);
        return NextResponse.json({ received: true, runId: result.runId, status: result.status });
      } catch (err: any) {
        await markWebhookProcessed(explicitId, err?.message || "Flow execution threw an error", event?.createdAt);
        throw err;
      }
    }

    const result = await startFlowRun({
      flow,
      trigger: "webhook",
      triggerPayload: payload,
    });

    return NextResponse.json({ received: true, runId: result.runId, status: result.status });
  } catch (error) {
    console.error("[webhooks/flows]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
