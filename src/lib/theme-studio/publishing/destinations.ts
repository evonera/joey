import { agencyDestinationIds } from "@/lib/agency/destinations";

export function zernioPlatform(platform: string): string {
  return platform === "x" ? "twitter" : platform;
}

export function packageDestinationIds(provenance: unknown, connectedAccounts: unknown, metrics: unknown) {
  const pageAccounts = Array.isArray(connectedAccounts) ? connectedAccounts.filter((id): id is string => typeof id === "string") : [];
  const selectedAccountIds = agencyDestinationIds(provenance, pageAccounts);
  const prior = metrics && typeof metrics === "object" ? metrics as Record<string, unknown> : {};
  const customAgent = provenance && typeof provenance === "object" && "customAgentId" in provenance && provenance.customAgentId;
  const priorAccountId = typeof prior.publishAccountId === "string" && (!customAgent || selectedAccountIds.includes(prior.publishAccountId))
    ? prior.publishAccountId : undefined;
  return { selectedAccountIds, priorAccountId, lookupIds: [...new Set([...selectedAccountIds, ...(priorAccountId ? [priorAccountId] : [])])] };
}

export function matchingPackageAccounts<T extends { id: string; platform: string; isActive: boolean | null }>(
  accounts: T[], platform: string, selectedAccountIds: string[], priorAccountId?: string,
): T[] {
  const target = zernioPlatform(platform);
  const prior = priorAccountId ? accounts.filter(account => account.id === priorAccountId && account.isActive === true && zernioPlatform(account.platform) === target) : [];
  const selected = accounts.filter(account => selectedAccountIds.includes(account.id) && account.isActive !== false && zernioPlatform(account.platform) === target);
  return [...new Map([...prior, ...selected].map(account => [account.id, account])).values()];
}
