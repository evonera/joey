import { describe, expect, it, vi } from "vitest";

const admit = vi.hoisted(() => vi.fn().mockResolvedValue({ authenticated: true }));
vi.mock("@/lib/telegram", () => ({
  TELEGRAM_UPDATE_LIMIT_BYTES: 1024 * 1024,
  admitTelegramUpdate: admit,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ installationId: "installation-1" }) };
function request(body: ReadableStream<Uint8Array> | null, contentLength?: string) {
  const headers = new Headers({ "x-telegram-bot-api-secret-token": "secret" });
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return { body, headers } as never;
}

describe("Telegram webhook body limit", () => {
  it("rejects malformed and oversized declared lengths before reading", async () => {
    admit.mockClear();
    expect((await POST(request(null, "Infinity"), context)).status).toBe(400);
    expect((await POST(request(null, String(1024 * 1024 + 1)), context)).status).toBe(413);
    expect((await POST(request(null, "9".repeat(400)), context)).status).toBe(413);
    expect(admit).not.toHaveBeenCalled();
  });

  it("cancels a streamed oversized body before authentication", async () => {
    admit.mockClear();
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1));
      },
      cancel() { canceled = true; },
    });
    expect((await POST(request(body), context)).status).toBe(413);
    expect(canceled).toBe(true);
    expect(admit).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 before admission", async () => {
    admit.mockClear();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } });
    expect((await POST(request(body), context)).status).toBe(400);
    expect(admit).not.toHaveBeenCalled();
  });

  it("rejects a valid update when its webhook secret is wrong", async () => {
    admit.mockResolvedValueOnce({ authenticated: false });
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"update_id":1}')); controller.close(); } });
    expect((await POST(request(body), context)).status).toBe(401);
  });

  it("admits a valid small update", async () => {
    admit.mockClear();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"update_id":1}'));
        controller.close();
      },
    });
    const response = await POST(request(body), context);
    expect(response.status).toBe(200);
    expect(admit).toHaveBeenCalledWith("installation-1", "secret", { update_id: 1 });
  });
});
