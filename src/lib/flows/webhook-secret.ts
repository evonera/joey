import { createHash, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "sha256:";

export function hashWebhookSecret(secret: string): string {
  return `${HASH_PREFIX}${createHash("sha256").update(secret).digest("hex")}`;
}

/** Verifies both new hashed secrets and legacy plaintext rows without timing leaks. */
export function verifyWebhookSecret(secret: string | null, storedSecret: string | null): boolean {
  if (!secret || !storedSecret) return false;
  const hashed = storedSecret.startsWith(HASH_PREFIX);
  const expected = hashed ? storedSecret.slice(HASH_PREFIX.length) : storedSecret;
  const candidate = hashed ? createHash("sha256").update(secret).digest("hex") : secret;
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);
  return expectedBuffer.length === candidateBuffer.length && timingSafeEqual(expectedBuffer, candidateBuffer);
}

export function isHashedWebhookSecret(secret: string | null): boolean {
  return Boolean(secret?.startsWith(HASH_PREFIX));
}
