import { createHash } from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const YOUTUBE_REQUEST_LIMITS = {
  workspaceHour: 30,
  workspaceDay: 400,
  credentialHour: 250,
} as const;

type QuotaScope = "workspace_hour" | "workspace_day" | "credential_hour";

export class YoutubeQuotaError extends Error {
  readonly code = "youtube_quota_admission";

  constructor(readonly scope: QuotaScope, readonly resetAt: number) {
    super(scope === "credential_hour"
      ? "YouTube API request allowance for this credential is reached. Wait for the next hourly window before checking again; RSS monitoring remains available."
      : `This workspace has reached its ${scope === "workspace_day" ? "daily" : "hourly"} YouTube API request allowance. Wait for the next window before checking again; RSS monitoring remains available.`);
    this.name = "YoutubeQuotaError";
  }
}

/**
 * Call immediately before EACH outbound YouTube API attempt, including retries.
 * Uses durable fixed UTC windows; does not cache or reuse collection results.
 * A channel check normally consumes three attempts, a direct video one.
 * Credential fingerprints are shared across tenants but never contain the key.
 * The hourly credential cap allows at most 6,250 attempts in a 25-hour Pacific
 * quota day for THIS credential through Joey. Other keys/clients on the same
 * Google Cloud project still share Google's project quota and need monitoring.
 */
export async function consumeYoutubeRequest(tenantId: string, apiKey: string): Promise<void> {
  if (!tenantId.trim() || tenantId.length > 128) throw new Error("YouTube request admission requires a workspace.");
  if (!apiKey || apiKey.length > 512 || /\s/.test(apiKey)) throw new Error("YouTube Data API credential is missing or invalid.");
  const credential = createHash("sha256").update(apiKey).digest("hex");
  const workspace = createHash("sha256").update(tenantId).digest("hex");
  const prefix = `youtube-api:${credential}`;
  const limits: Array<{ bucket: string; limit: number; windowMs: number; scope: QuotaScope }> = [
    { bucket: `${prefix}:workspace:${workspace}:hour`, limit: YOUTUBE_REQUEST_LIMITS.workspaceHour, windowMs: HOUR_MS, scope: "workspace_hour" },
    { bucket: `${prefix}:workspace:${workspace}:day`, limit: YOUTUBE_REQUEST_LIMITS.workspaceDay, windowMs: DAY_MS, scope: "workspace_day" },
    { bucket: `${prefix}:hour`, limit: YOUTUBE_REQUEST_LIMITS.credentialHour, windowMs: HOUR_MS, scope: "credential_hour" },
  ];

  // Rejecting a workspace before the shared counter prevents a caller that has
  // exhausted its allowance from continuing to consume other tenants' capacity.
  // Admission is conservative: a later denied bucket or transport failure does
  // not refund earlier counters and cannot silently repeat a quota-consuming call.
  for (const entry of limits) {
    let result: Awaited<ReturnType<typeof checkRateLimit>>;
    try { result = await checkRateLimit(entry.bucket, entry.limit, entry.windowMs); }
    catch { throw new Error("YouTube request allowance could not be checked. Retry later; no API request was sent."); }
    if (!result.allowed) throw new YoutubeQuotaError(entry.scope, result.resetAt);
  }
}
