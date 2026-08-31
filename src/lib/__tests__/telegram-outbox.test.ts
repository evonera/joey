import { describe, expect, it } from "vitest";
import { telegramOutboxKey } from "../telegram-outbox";

describe("Telegram outbox idempotency", () => {
  it("is stable for recovery of the same flow item", () => {
    expect(telegramOutboxKey({ runId: "run", nodeId: "send", itemKey: "item-1" })).toBe(telegramOutboxKey({ runId: "run", nodeId: "send", itemKey: "item-1" }));
  });
  it("isolates nodes and fan-out items", () => {
    expect(new Set([telegramOutboxKey({ runId: "run", nodeId: "a", itemKey: "1" }), telegramOutboxKey({ runId: "run", nodeId: "a", itemKey: "2" }), telegramOutboxKey({ runId: "run", nodeId: "b", itemKey: "1" })]).size).toBe(3);
  });
});
