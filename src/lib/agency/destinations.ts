/** Persisted automation bindings are an upper bound, not a publish grant.
 * The human publisher must also check current page links, active accounts,
 * role, evidence review and finished media. Malformed agency provenance fails
 * closed instead of falling back to all accounts on the Theme Page. */
export function agencyDestinationIds(provenance: unknown, pageIds: string[]): string[] {
  if (!provenance || typeof provenance !== "object") return pageIds;
  const origin = provenance as Record<string, unknown>;
  if (!origin.customAgentId) return pageIds;
  const ids = origin.destinationAccountIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 15 || ids.some((id) => typeof id !== "string")) return [];
  return pageIds.filter((id) => ids.includes(id));
}
