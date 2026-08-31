import { describe, expect, it } from "vitest";
import { parseTelegramApprovalCallback, telegramApprovalCallback } from "../telegram-approvals";

describe("Telegram approval callbacks", () => {
  const token = "abcdefghijklmnopqrstuvwx";
  it("uses opaque callback data below Telegram's 64-byte limit", () => {
    const callback = telegramApprovalCallback(token, true);
    expect(Buffer.byteLength(callback)).toBeLessThanOrEqual(64);
    expect(callback).not.toContain("run");
    expect(parseTelegramApprovalCallback(callback)).toEqual({ token, approve: true });
  });
  it("rejects malformed and oversized callbacks", () => {
    expect(parseTelegramApprovalCallback("ja:run-id:1")).toBeNull();
    expect(parseTelegramApprovalCallback(`ja:${"a".repeat(70)}:1`)).toBeNull();
  });
});
