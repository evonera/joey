import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, maskKey } from "../crypto";

const TEST_KEY = Buffer.from("01234567890123456789012345678901").toString("base64");

function legacyCiphertext(value: string, context?: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(TEST_KEY, "base64"), iv);
  if (context) cipher.setAAD(Buffer.from(context));
  const ciphertext = cipher.update(value, "utf8", "hex") + cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ciphertext}`;
}

describe("Crypto Utilities", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    delete process.env.ALLOW_LEGACY_UNBOUND_SECRETS;
  });

  it("writes tenant-bound versioned ciphertext", () => {
    const value = "my secret api key";
    const encrypted = encrypt(value, "tenant_alpha");
    expect(encrypted).toMatch(/^v2:/);
    expect(decrypt(encrypted, "tenant_alpha")).toBe(value);
    expect(() => decrypt(encrypted, "tenant_attacker")).toThrow();
  });

  it("reads legacy AAD ciphertext with its tenant only", () => {
    const encrypted = legacyCiphertext("legacy bound key", "tenant_alpha");
    expect(decrypt(encrypted, "tenant_alpha")).toBe("legacy bound key");
    expect(() => decrypt(encrypted, "tenant_attacker")).toThrow();
  });

  it("allows the explicit compatibility bridge for legacy unbound rows", () => {
    const encrypted = legacyCiphertext("legacy key");
    expect(decrypt(encrypted, "tenant_alpha")).toBe("legacy key");
    process.env.ALLOW_LEGACY_UNBOUND_SECRETS = "false";
    expect(() => decrypt(encrypted, "tenant_alpha")).toThrow();
  });

  it("rejects malformed key material and missing contexts", () => {
    process.env.ENCRYPTION_KEY = Buffer.from("too short").toString("base64");
    expect(() => encrypt("value", "tenant_alpha")).toThrow(/exactly 32 bytes/);
    process.env.ENCRYPTION_KEY = TEST_KEY;
    expect(() => encrypt("value", "")).toThrow(/context is required/i);
    expect(() => decrypt(encrypt("value", "tenant_alpha"), "")).toThrow(/context is required/i);
  });

  it("masks keys safely", () => {
    expect(maskKey("AIzaSyD-1234567890abcdefghijklmnopqrstuvwxyz")).toEqual("AIzaSy••••••••wxyz");
    expect(maskKey("sk-ant-api03-abcdef1234567890")).toEqual("sk-ant••••••••7890");
    expect(maskKey("short")).toEqual("••••••••");
  });
});
