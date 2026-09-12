import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markWebhookProcessed: vi.fn(),
  processZernioWebhookEvent: vi.fn(),
  storeWebhookEvent: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));

vi.mock("@/lib/webhooks", () => ({
  markWebhookProcessed: mocks.markWebhookProcessed,
  storeWebhookEvent: mocks.storeWebhookEvent,
  verifyWebhookSignature: mocks.verifyWebhookSignature,
}));

vi.mock("@/lib/zernio-webhook-processing", () => ({
  processZernioWebhookEvent: mocks.processZernioWebhookEvent,
}));

import { POST } from "../route";

const originalSecret = process.env.ZERNIO_WEBHOOK_SECRET;

function webhookRequest(body: ReadableStream<Uint8Array> | null, contentLength?: string) {
  const headers = new Headers({ "X-Zernio-Signature": "test-signature" });
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return { body, headers } as never;
}

describe("Zernio webhook body limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ZERNIO_WEBHOOK_SECRET = "test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.ZERNIO_WEBHOOK_SECRET;
    else process.env.ZERNIO_WEBHOOK_SECRET = originalSecret;
  });

  it("rejects an oversized declared body before reading or verifying it", async () => {
    const response = await POST(webhookRequest(null, String(1024 * 1024 + 1)));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook payload exceeds the 1 MiB limit.",
    });
    expect(mocks.verifyWebhookSignature).not.toHaveBeenCalled();
    expect(mocks.storeWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed body before signature verification", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1));
      },
    });

    const response = await POST(webhookRequest(stream));

    expect(response.status).toBe(413);
    expect(mocks.verifyWebhookSignature).not.toHaveBeenCalled();
    expect(mocks.storeWebhookEvent).not.toHaveBeenCalled();
  });

  it("keeps the 413 response when canceling an oversized stream rejects", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      },
      cancel() {
        return Promise.reject(new Error("sender disconnected"));
      },
    });

    const response = await POST(webhookRequest(stream));

    expect(response.status).toBe(413);
    expect(mocks.verifyWebhookSignature).not.toHaveBeenCalled();
  });

  it("rejects a missing body as malformed before signature verification", async () => {
    const response = await POST(webhookRequest(null));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Webhook payload is required." });
    expect(mocks.verifyWebhookSignature).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 as malformed before signature verification", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3, 0x28]));
        controller.close();
      },
    });

    const response = await POST(webhookRequest(stream));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Webhook payload must be valid UTF-8." });
    expect(mocks.verifyWebhookSignature).not.toHaveBeenCalled();
  });

  it("rejects a malformed Content-Length header as a client error", async () => {
    const response = await POST(webhookRequest(null, "not-a-number"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Content-Length header." });
    expect(mocks.verifyWebhookSignature).not.toHaveBeenCalled();
  });
});
