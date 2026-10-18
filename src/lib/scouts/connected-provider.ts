import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialAccounts, tenants, apiKeys } from "@/lib/db/schema";
import { canonicalScoutPostUrl, observedMetric, observedTimestamp, scoutPostIdentity } from "./post-evidence";
import { validateScoutSource } from "./source-validation";
import type { ScoutCollectionRequest, ScoutCollectionContext, ScoutDataProvider, ScoutPostItem } from "./data-provider";

function profileHandle(source: ScoutCollectionRequest) {
  validateScoutSource(source.targetUrl, source.platform);
  const parts = new URL(source.targetUrl).pathname.split("/").filter(Boolean);
  if (parts.length !== 1 || ["p", "reel", "reels", "explore", "status", "video", "home", "i"].includes(parts[0].toLowerCase())) return undefined;
  return parts[0].replace(/^@/, "").toLowerCase();
}

/** A provider credential is never used to inspect accounts outside this workspace. */
export async function findConnectedScoutAccount(tenantId: string, source: ScoutCollectionRequest) {
  if (!["instagram", "twitter", "tiktok"].includes(source.platform)) return undefined;
  const handle = profileHandle(source); if (!handle) return undefined;
  const [tenant, key, accounts] = await Promise.all([
    db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { zernioProfileId: true } }),
    db.query.apiKeys.findFirst({ where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "zernio"), eq(apiKeys.status, "active")), columns: { id: true } }),
    db.query.socialAccounts.findMany({ where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true)) }),
  ]);
  if (!tenant?.zernioProfileId || !key) return undefined;
  const account = accounts.find(a => (a.platform === "x" ? "twitter" : a.platform) === source.platform && a.accountName?.replace(/^@/, "").toLowerCase() === handle);
  return account ? { account, profileId: tenant.zernioProfileId, handle } : undefined;
}

type AnalyticsPost = {
  content?: unknown; publishedAt?: unknown; status?: unknown; profileId?: unknown;
  platforms?: Array<{ accountId?: unknown; platform?: unknown; status?: unknown; syncStatus?: unknown; platformPostUrl?: unknown; analytics?: { views?: unknown; likes?: unknown } }>;
};
export function connectedScoutItems(posts: AnalyticsPost[], accountId: string, platform: string, profileId: string): ScoutPostItem[] {
  const items: ScoutPostItem[] = [];
  for (const post of posts) {
    if (post.status !== "published" || (post.profileId && post.profileId !== profileId)) continue;
    const target = post.platforms?.find(p => p.accountId === accountId && p.platform === platform && p.status === "published" && p.syncStatus === "synced");
    const url = canonicalScoutPostUrl(target?.platformPostUrl);
    if (!target || !url) continue;
    validateScoutSource(url, platform);
    const views = observedMetric(target.analytics?.views), likes = observedMetric(target.analytics?.likes), timestamp = observedTimestamp(post.publishedAt);
    items.push({ id: scoutPostIdentity(url), url, text: typeof post.content === "string" ? post.content.slice(0, 6000) : "", ...(views !== undefined ? { views } : {}), ...(likes !== undefined ? { likes } : {}), ...(timestamp ? { timestamp } : {}) });
  }
  return [...new Map(items.map(item => [item.id, item])).values()].slice(0, 15);
}

export class ConnectedAccountScoutProvider implements ScoutDataProvider {
  readonly kind = "connected" as const;
  constructor(private readonly tenantId: string) {}
  async fetchRecentPosts(source: ScoutCollectionRequest, context: ScoutCollectionContext) {
    context.signal.throwIfAborted();
    const selected = await findConnectedScoutAccount(this.tenantId, source);
    if (!selected) throw new Error("Reconnect this social account in the current workspace before checking it.");
    const { getZernioClientForTenant } = await import("@/lib/publisher-core");
    const { zernio } = await getZernioClientForTenant(this.tenantId);
    await context.beforePaidPhase?.();
    context.signal.throwIfAborted();
    const response = await zernio.analytics.getAnalytics({ query: { profileId: selected.profileId, accountId: selected.account.platformAccountId, platform: source.platform, source: "all", limit: 15, page: 1, sortBy: "date", order: "desc" }, signal: context.signal });
    context.signal.throwIfAborted();
    if (response.error || response.response.status !== 200 || !response.data) throw new Error("Connected-account analytics are unavailable or still syncing. Try again after the provider sync completes.");
    const data = response.data as { accounts?: Array<{ _id?: string; username?: string; profileId?: string }>; posts?: AnalyticsPost[] };
    if (!data.accounts?.some(a => a._id === selected.account.platformAccountId && a.profileId === selected.profileId && a.username?.replace(/^@/, "").toLowerCase() === selected.handle)) throw new Error("The provider account no longer matches this Scout. Reconnect it before checking again.");
    return connectedScoutItems(data.posts ?? [], selected.account.platformAccountId, source.platform, selected.profileId);
  }
}
