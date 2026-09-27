import { describe, expect, it } from "vitest";
import { readBoundedJson } from "../read-bounded-json";

describe("readBoundedJson", () => {
  it("parses JSON within the byte limit", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ roomIds: ["workspace:room"] }),
    });
    await expect(readBoundedJson(request, 128)).resolves.toEqual({
      ok: true,
      value: { roomIds: ["workspace:room"] },
    });
  });

  it("rejects an oversized streamed body without a declared length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"12345"}'));
        controller.close();
      },
    });
    const request = new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit & { duplex: "half" });
    await expect(readBoundedJson(request, 8)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost", { method: "POST", body: "{" });
    await expect(readBoundedJson(request, 32)).resolves.toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });
});
