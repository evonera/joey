import { describe, expect, it } from "vitest";
import { newTelegramWebhookSecret, telegramChatType, telegramSenderAllowed, telegramSenderId, telegramSenderIsBot } from "../telegram";
import { hashWebhookSecret, verifyWebhookSecret } from "@/lib/flows/webhook-secret";

describe("Telegram webhook security", () => {
  it("creates high-entropy secrets that are stored only as hashes", () => {
    const secret = newTelegramWebhookSecret();
    expect(secret.length).toBeGreaterThanOrEqual(40);
    const stored = hashWebhookSecret(secret);
    expect(stored).not.toContain(secret);
    expect(verifyWebhookSecret(secret, stored)).toBe(true);
    expect(verifyWebhookSecret(`${secret}x`, stored)).toBe(false);
  });

  it("extracts sender IDs from messages and callback queries", () => {
    expect(telegramSenderId({ message: { from: { id: 42 } } })).toBe(42);
    expect(telegramSenderId({ callback_query: { from: { id: 99 } } })).toBe(99);
    expect(telegramSenderId({ message: { from: { id: "42" } } })).toBeNull();
  });

  it("fail-closed allowlist: empty denies everyone", () => {
    expect(telegramSenderAllowed([], 42)).toBe(false);
    expect(telegramSenderAllowed([], null)).toBe(false);
    expect(telegramSenderAllowed([42], 42)).toBe(true);
    expect(telegramSenderAllowed([42], 99)).toBe(false);
    expect(telegramSenderAllowed([42], null)).toBe(false);
  });

  it("rejects bot senders and non-private chats", () => {
    expect(telegramSenderIsBot({ message: { from: { id: 42, is_bot: true } } })).toBe(true);
    expect(telegramSenderIsBot({ message: { from: { id: 42 } } })).toBe(false);
    expect(telegramChatType({ message: { chat: { type: "private" } } })).toBe("private");
    expect(telegramChatType({ message: { chat: { type: "group" } } })).toBe("group");
    expect(telegramChatType({ callback_query: { from: { id: 1 } } })).toBeNull();
  });

  it("exports processTelegramUpdate handler for update lifecycle", async () => {
    const { processTelegramUpdate } = await import("../telegram");
    expect(typeof processTelegramUpdate).toBe("function");
  });
});
