/**
 * Conservative PII redaction for text persisted to long-term memory,
 * notifications, and other durable stores.
 *
 * Patterns are deliberately narrow (email / phone / key-like secrets) so
 * ordinary prose and post metrics ("1,234 likes") pass through untouched.
 * This is a backstop, not a guarantee — callers must still bound length and
 * scope what they store.
 */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SECRET_PATTERN =
  /\b(sk-[A-Za-z0-9_-]{8,}|xox[bap]-[A-Za-z0-9-]+|ghp_[A-Za-z0-9]{8,}|gho_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|vercel_blob_rw_[A-Za-z0-9_-]+)\b/g;
const BEARER_PATTERN = /\bbearer\s+[A-Za-z0-9_\-.~+/=]{8,}/gi;

export function redactPII(text: string): string {
  // Specific-before-general: key formats contain digit runs that the phone
  // pattern would otherwise mangle first, breaking the key match.
  return text
    .replace(EMAIL_PATTERN, "[email redacted]")
    .replace(SECRET_PATTERN, "[key redacted]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(PHONE_PATTERN, "[phone redacted]");
}
