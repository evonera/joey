import { after, NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import {
  admitWebhookDelivery,
  executeWebhookDelivery,
  normalizeSenderDeliveryId,
  WEBHOOK_REQUEST_LIMIT_BYTES,
} from "@/lib/flows/incoming-webhooks";
import {
  hashWebhookSecret,
  isHashedWebhookSecret,
  verifyWebhookSecret,
} from "@/lib/flows/webhook-secret";

export const runtime = "nodejs";

function requestSecret(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim() || null;
  return request.headers.get("x-joey-webhook-secret")?.trim() || null;
}

async function readBoundedJsonObject(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("Content-Type must be application/json.");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > WEBHOOK_REQUEST_LIMIT_BYTES)) {
    throw new Error("Webhook payload exceeds the 1 MiB limit.");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > WEBHOOK_REQUEST_LIMIT_BYTES) {
      await reader.cancel();
      throw new Error("Webhook payload exceeds the 1 MiB limit.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new Error("Request body must be valid UTF-8 JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Webhook payload must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> },
) {
  const { flowId } = await params;
  const flow = await db.query.flows.findFirst({ where: eq(flows.id, flowId) });
  const secret = requestSecret(request);
  if (!flow || !verifyWebhookSecret(secret, flow.webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook credentials." }, { status: 401 });
  }

  // Compare-and-swap prevents an overlapping legacy-secret request from undoing
  // a secret rotation that committed after this request read the flow row.
  if (secret && flow.webhookSecret && !isHashedWebhookSecret(flow.webhookSecret)) {
    await db
      .update(flows)
      .set({ webhookSecret: hashWebhookSecret(secret), updatedAt: new Date() })
      .where(
        and(
          eq(flows.id, flow.id),
          eq(flows.tenantId, flow.tenantId),
          eq(flows.webhookSecret, flow.webhookSecret),
        ),
      );
  }

  if (flow.status !== "active") {
    return NextResponse.json({ error: "Flow is not active." }, { status: 409 });
  }
  const graph = flow.graph as { nodes?: Array<{ type?: string }> };
  if (!graph.nodes?.some((node) => node.type === "trigger.incoming_webhook")) {
    return NextResponse.json({ error: "Flow has no incoming webhook trigger." }, { status: 409 });
  }

  let deliveryId: string | null;
  let payload: Record<string, unknown>;
  try {
    deliveryId = normalizeSenderDeliveryId(
      request.headers.get("idempotency-key") ?? request.headers.get("x-joey-delivery-id"),
    );
    payload = await readBoundedJsonObject(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook request." },
      { status: 400 },
    );
  }

  const admission = await admitWebhookDelivery({
    tenantId: flow.tenantId,
    flowId: flow.id,
    deliveryId,
    payload,
  });
  if (!admission.admitted) {
    return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
  }

  after(() =>
    executeWebhookDelivery({
      flow,
      deliveryRowId: admission.id,
      senderDeliveryId: deliveryId,
      attempt: admission.attempt,
      payload,
    }),
  );
  return NextResponse.json(
    { accepted: true, delivery: admission.id },
    { status: 202 },
  );
}
