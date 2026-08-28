import { describe, expect, it } from "vitest";
import { hashWebhookSecret, verifyWebhookSecret } from "../webhook-secret";

describe("flow webhook secrets", () => {
  it("verifies a hashed secret without accepting a different value", () => {
    const secret = "wf_0123456789abcdef0123456789abcdef";
    const stored = hashWebhookSecret(secret);
    expect(verifyWebhookSecret(secret, stored)).toBe(true);
    expect(verifyWebhookSecret("wf_wrong", stored)).toBe(false);
  });

  it("supports legacy secrets during the one-time upgrade window", () => {
    expect(verifyWebhookSecret("legacy-secret", "legacy-secret")).toBe(true);
    expect(verifyWebhookSecret("wrong", "legacy-secret")).toBe(false);
  });
});
