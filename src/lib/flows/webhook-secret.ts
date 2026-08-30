import { createHash, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "sha256:";

export function hashWebhookSecret(secret: string): string {
  return `${HASH_PREFIX}${createHash("sha256").update(secret).digest("hex")}`;
}

export function isHashedWebhookSecret(secret: string | null): boolean {
  return Boolean(secret?.startsWith(HASH_PREFIX));
}

/** Supports a compare-and-swap migration from legacy plaintext values. */
export function verifyWebhookSecret(candidate: string | null, stored: string | null): boolean {
  if (!candidate || !stored) return false;
  const hashed = isHashedWebhookSecret(stored);
  const expected = Buffer.from(hashed ? stored.slice(HASH_PREFIX.length) : stored, "utf8");
  const actual = Buffer.from(
    hashed ? createHash("sha256").update(candidate).digest("hex") : candidate,
    "utf8",
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
