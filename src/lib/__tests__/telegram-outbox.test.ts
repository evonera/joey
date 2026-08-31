import { describe, expect, it } from "vitest";
import { telegramOutboxKey } from "../telegram-outbox";

describe("Telegram outbox idempotency", () => {
  it("is stable for recovery of the same flow item", () => {
    expect(telegramOutboxKey({ runId: "run", nodeId: "send", itemKey: "item-1" })).toBe(telegramOutboxKey({ runId: "run", nodeId: "send", itemKey: "item-1" }));
  });
  it("isolates nodes and fan-out items", () => {
    expect(new Set([telegramOutboxKey({ runId: "run", nodeId: "a", itemKey: "1" }), telegramOutboxKey({ runId: "run", nodeId: "a", itemKey: "2" }), telegramOutboxKey({ runId: "run", nodeId: "b", itemKey: "1" })]).size).toBe(3);
  });

  it("exports recoverStaleOutboxMessages for worker timeout reconciliation", async () => {
    const { recoverStaleOutboxMessages } = await import("../telegram-outbox");
    expect(typeof recoverStaleOutboxMessages).toBe("function");
  });

  it("rejects messages exceeding Telegram 4096 character limit in flow node", async () => {
    const { telegramSendNode } = await import("../flows/nodes/actions/telegram-send");
    const oversizedInput = "a".repeat(4097);
    await expect(
      telegramSendNode.execute(oversizedInput, { chatId: "123", messageTemplate: "{{input}}" }, { tenantId: "t1", flowId: "f1", runId: "r1", nodeId: "n1" })
    ).rejects.toThrow(/exceeds 4096 characters/);
  });
});
