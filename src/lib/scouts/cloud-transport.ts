import { createHash } from "node:crypto";

/** Operator-only transport credentials. Never accept these from model/UI input. */
export function scoutCloudHeaders(endpoint: string, operationId?: string): Record<string, string> {
  const configuredEndpoint = process.env.SCOUT_MODAL_ENDPOINT;
  const key = process.env.SCOUT_MODAL_KEY;
  const secret = process.env.SCOUT_MODAL_SECRET;
  const protectedTransport = Boolean(configuredEndpoint || key || secret);
  const headers: Record<string, string> = {};
  if (protectedTransport) {
    if (!configuredEndpoint || !key || !secret)
      throw new Error("Configure all three server-only Scout Modal transport settings.");
    let approved: URL;
    try { approved = new URL(configuredEndpoint); }
    catch { throw new Error("Invalid approved Scout Modal endpoint."); }
    if (approved.protocol !== "https:" || approved.username || approved.password || approved.search || approved.hash ||
        approved.href !== new URL(endpoint).href)
      throw new Error("Scout Modal credentials are bound to the exact approved HTTPS endpoint.");
    if (!operationId) throw new Error("Protected Cloud collection requires a durable operation ID.");
    if ([key, secret].some(value => /[\r\n]/.test(value) || value.length > 512))
      throw new Error("Invalid Scout Modal transport credentials.");
    headers["Modal-Key"] = key;
    headers["Modal-Secret"] = secret;
  }
  if (operationId !== undefined) {
    if (!operationId || operationId.length > 512)
      throw new Error("Invalid Scout collection operation ID.");
    // Fixed length and opaque; no workspace/source IDs leave in a transport key.
    headers["Idempotency-Key"] = `jsc_${createHash("sha256").update(operationId).digest("hex")}`;
  }
  return headers;
}

export class ScoutProviderError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ScoutProviderError";
  }
}

export function customProviderFailure(status: number): ScoutProviderError {
  const known: Record<number, [string, string]> = {
    401: ["provider_unauthorized", "Check the workspace Cloud key and server transport credentials."],
    403: ["provider_forbidden", "Cloud workspace is paused or this source is not approved."],
    409: ["collection_conflict", "This collection is running or needs reconciliation; do not start another paid request."],
    410: ["collection_expired", "The saved evidence expired; do not automatically recollect."],
    429: ["provider_quota", "Cloud collection quota reached."],
    503: ["provider_unavailable", "Cloud collection is disabled or unavailable."],
    504: ["collection_uncertain", "Cloud collection timed out; reconcile before starting another request."],
  };
  const [code, detail] = known[status] ?? ["provider_failure", "Collection failed; no automatic retry or provider fallback was attempted."];
  return new ScoutProviderError(status, code, `Custom Scout provider returned HTTP ${status}. ${detail}`);
}
