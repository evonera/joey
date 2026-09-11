import { NextRequest, NextResponse, after } from "next/server";
import { verifyWebhookSignature, storeWebhookEvent, markWebhookProcessed, type ZernioWebhookPayload } from "@/lib/webhooks";
import { processZernioWebhookEvent } from "@/lib/zernio-webhook-processing";

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

    const rawBody = await readBoundedWebhookBody(req);

    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    let payload: ZernioWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!payload || typeof payload !== "object" || typeof payload.id !== "string" || !payload.id || payload.id.length > 500 || typeof payload.event !== "string" || !payload.event || payload.event.length > 100) {
      return NextResponse.json({ error: "Invalid event envelope" }, { status: 400 });
    }
    const { event, isDuplicate } = await storeWebhookEvent(payload);
    if (isDuplicate || !event) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const attemptCreatedAt = event.createdAt;

    if (payload.event === "webhook.test") {
      await markWebhookProcessed(payload.id, undefined, attemptCreatedAt);
      return NextResponse.json({ received: true, message: "Webhook test successful" });
    }

    after(() => processZernioWebhookEvent(payload, attemptCreatedAt));

    return NextResponse.json({ received: true });
  } catch (error: any) {
    if (error instanceof WebhookBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    console.error("[webhooks/zernio]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

const ZERNIO_WEBHOOK_LIMIT_BYTES = 1024 * 1024;

class WebhookBodyTooLargeError extends Error {}

async function readBoundedWebhookBody(request: Request): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > ZERNIO_WEBHOOK_LIMIT_BYTES)) {
    throw new WebhookBodyTooLargeError("Webhook payload exceeds the 1 MiB limit.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Webhook payload is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > ZERNIO_WEBHOOK_LIMIT_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The size violation determines the response even if the sender has
        // already torn down the stream and cancellation itself rejects.
      }
      throw new WebhookBodyTooLargeError("Webhook payload exceeds the 1 MiB limit.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}
