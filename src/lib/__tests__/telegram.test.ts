import { describe, expect, it } from "vitest";
import { newTelegramWebhookSecret, telegramSenderAllowed, telegramSenderId } from "../telegram";
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

  it("enforces configured allowlists and permits all senders only when empty", () => {
    expect(telegramSenderAllowed([], 42)).toBe(true);
    expect(telegramSenderAllowed([42], 42)).toBe(true);
    expect(telegramSenderAllowed([42], 99)).toBe(false);
    expect(telegramSenderAllowed([42], null)).toBe(false);
  });
});
