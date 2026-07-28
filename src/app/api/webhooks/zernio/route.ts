import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifyWebhookSignature, storeWebhookEvent, markWebhookProcessed, resolveTenantFromPayload, type ZernioWebhookPayload } from "@/lib/webhooks";
import { webhookEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";

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
