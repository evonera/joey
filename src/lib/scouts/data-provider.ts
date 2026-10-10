import { z } from "zod";
import { parseRssXml } from "@/lib/theme-studio/feed-parser";
import { canonicalScoutPostUrl, scoutPostIdentity, observedMetric, observedTimestamp } from "./post-evidence";
import { resolveToken } from "@/lib/flows/nodes/data/apify-actor";
import { readBoundedJson } from "@/lib/http/read-bounded-json";
import { outboundRequest, resolveOutboundTarget } from "@/lib/flows/outbound-request";
import { isPublicScoutHttpsUrl as publicHttps, validateScoutSource } from "./source-validation";
import { customProviderFailure, scoutCloudHeaders } from "./cloud-transport";

/** Server-owned collection boundary. Providers supply evidence, never approvals or drafts. */
export interface ScoutPostItem {
  id: string;
  url: string;
  text: string;
  views?: number;
  likes?: number;
  timestamp?: string;
  /** Collection time assigned by Joey, never supplied by an upstream provider. */
  observedAt?: string;
}
export interface ScoutCollectionRequest {
  targetUrl: string;
  platform: string;
}
export interface ScoutCollectionContext {
  signal: AbortSignal;
  operationId?: string;
  beforePaidPhase?: () => Promise<void>;
}
export interface ScoutDataProvider {
  readonly kind: "apify" | "custom" | "mock" | "rss";
  fetchRecentPosts(request: ScoutCollectionRequest, context: ScoutCollectionContext): Promise<ScoutPostItem[]>;
}

const MAX_ITEMS = 15;
const MAX_BYTES = 2 * 1024 * 1024;
const itemSchema = z
  .object({
    id: z.string().min(1).max(120),
    url: z.string().refine(publicHttps),
    text: z.string().max(6000),
    views: z.number().finite().min(0).max(1e12).optional(),
    likes: z.number().finite().min(0).max(1e12).optional(),
    timestamp: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
const envelopeSchema = z.object({ version: z.literal(1), items: z.array(itemSchema).max(MAX_ITEMS) }).strict();

async function validateTarget(request: ScoutCollectionRequest, signal: AbortSignal) {
  validateScoutSource(request.targetUrl, request.platform);
  // Do not forward private DNS targets to collection services. The service must
  // independently validate/pin DNS when it fetches (its network is different).
  try {
    await resolveOutboundTarget(request.targetUrl, signal);
  } catch {
    throw new Error("Scout source must resolve to a public HTTPS address.");
  }
}

/** Article evidence only: a feed cannot report social engagement or profile changes. */
export class RssScoutProvider implements ScoutDataProvider {
  readonly kind = "rss" as const;
  async fetchRecentPosts(request: ScoutCollectionRequest, context: ScoutCollectionContext) {
    context.signal.throwIfAborted();
    if (request.platform !== "rss") throw new Error("RSS collection requires an RSS/Atom source.");
    await validateTarget(request, context.signal);
    await context.beforePaidPhase?.();
    context.signal.throwIfAborted();
    const response = await outboundRequest(request.targetUrl, {
      method: "GET",
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: context.signal,
      timeoutMs: 20_000,
      maxBytes: MAX_BYTES,
      maxRedirects: 3,
    });
    if (response.status < 200 || response.status >= 300)
      throw new Error(`RSS source returned HTTP ${response.status}.`);
    const xml = new TextDecoder("utf8", { fatal: true }).decode(response.buffer);
    if (!/<(?:rss|feed|rdf:RDF)(?:\s|>)/i.test(xml)) throw new Error("Source did not return an RSS or Atom feed.");
    const items = parseRssXml(xml)
      .slice(0, MAX_ITEMS)
      .map((item) => {
        const url = canonicalScoutPostUrl(item.url);
        if (!url) throw new Error("RSS source contains an invalid article URL.");
        return {
          id: scoutPostIdentity(url),
          url,
          text: `${item.title}\n${item.body}`.slice(0, 6000),
          ...(item.publishedAt ? { timestamp: item.publishedAt.toISOString() } : {}),
        };
      });
    return [...new Map(items.map((item) => [item.id, item])).values()];
  }
}

export class ApifyScoutProvider implements ScoutDataProvider {
  readonly kind = "apify" as const;
  constructor(private readonly token: string) {}
  async fetchRecentPosts(request: ScoutCollectionRequest, context: ScoutCollectionContext) {
    context.signal.throwIfAborted();
    await validateTarget(request, context.signal);
    await context.beforePaidPhase?.();
    context.signal.throwIfAborted();
    const actor =
      request.platform === "instagram"
        ? "apify/instagram-reel-scraper"
        : request.platform === "tiktok"
          ? "clockworks/tiktok-scraper"
          : "apify/web-scraper";
    const input =
      request.platform === "instagram"
        ? { username: [request.targetUrl], resultsLimit: MAX_ITEMS }
        : { directUrls: [request.targetUrl] };
    let response: Response;
    try {
      response = await fetch(
        `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?timeout=45`,
        {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
          body: JSON.stringify(input),
          signal: AbortSignal.any([context.signal, AbortSignal.timeout(50_000)]),
        }
      );
    } catch {
      throw new Error("Apify Scout collection failed or timed out.");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Apify scraper returned HTTP ${response.status}.`);
    }
    const bounded = await readBoundedJson(response as unknown as Request, MAX_BYTES);
    if (!bounded.ok || !Array.isArray(bounded.value)) throw new Error("Invalid or oversized Scout source response.");
    const rows = bounded.value.slice(0, MAX_ITEMS);
    if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)))
      throw new Error("Invalid Scout source items.");
    const target = canonicalScoutPostUrl(request.targetUrl);
    const items = rows.map((row: Record<string, unknown>) => {
      const url = canonicalScoutPostUrl(row.url || row.postUrl);
      if (!url || url === target) throw new Error("Invalid Scout source item URL: a stable post link is required.");
      const rawId = row.id;
      const id =
        (typeof rawId === "string" || typeof rawId === "number") && String(rawId).trim() && String(rawId).length <= 120
          ? String(rawId)
          : scoutPostIdentity(url);
      const views = observedMetric(row.videoViewCount ?? row.playCount ?? row.views);
      const likes = observedMetric(row.likesCount ?? row.diggCount ?? row.likes);
      const timestamp = observedTimestamp(row.timestamp ?? row.createTimeISO ?? row.createTime);
      return {
        id,
        url,
        text: String(row.caption || row.text || row.description || "").slice(0, 6000),
        ...(views !== undefined ? { views } : {}),
        ...(likes !== undefined ? { likes } : {}),
        ...(timestamp ? { timestamp } : {}),
      };
    });
    return [...new Map(items.map((item) => [item.id, item])).values()];
  }
}

export class MockScoutProvider implements ScoutDataProvider {
  readonly kind = "mock" as const;
  async fetchRecentPosts(request: ScoutCollectionRequest, context: ScoutCollectionContext) {
    if (!mockAllowed()) throw new Error("Mock Scout collection is disabled in production.");
    context.signal.throwIfAborted();
    return [
      {
        id: "sim-1",
        url: `${request.targetUrl}/p/recent-viral-hook`,
        text: "Stop scrolling: The 1 reason 90% of creators fail before reaching 10k followers. [Split-screen reaction with bold subtitle captions]",
        views: 125000,
        likes: 8400,
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "sim-2",
        url: `${request.targetUrl}/p/standard-post`,
        text: "Quick reminder to take a break this weekend.",
        views: 12000,
        likes: 800,
        timestamp: new Date(Date.now() - 86400000).toISOString(),
      },
    ];
  }
}

function customEndpoint(endpoint = process.env.SCOUT_PROVIDER_ENDPOINT || "") {
  if (!publicHttps(endpoint)) throw new Error("Configure a public HTTPS Scout provider endpoint on the server.");
  const url = new URL(endpoint);
  if (url.search || url.hash) throw new Error("Scout provider endpoint must not contain a query or fragment.");
  return endpoint;
}

export class CustomScoutProvider implements ScoutDataProvider {
  readonly kind = "custom" as const;
  private readonly endpoint: string;
  constructor(
    endpoint: string,
    private readonly token: string
  ) {
    this.endpoint = customEndpoint(endpoint);
  }
  async fetchRecentPosts(request: ScoutCollectionRequest, context: ScoutCollectionContext) {
    context.signal.throwIfAborted();
    const transportHeaders = scoutCloudHeaders(this.endpoint, context.operationId);
    await validateTarget(request, context.signal);
    await context.beforePaidPhase?.();
    context.signal.throwIfAborted();
    let response: Awaited<ReturnType<typeof outboundRequest>>;
    try {
      response = await outboundRequest(this.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...transportHeaders },
        body: JSON.stringify({
          version: 1,
          targetUrl: request.targetUrl,
          platform: request.platform,
          limit: MAX_ITEMS,
        }),
        signal: context.signal,
        timeoutMs: 50_000,
        maxBytes: MAX_BYTES,
        maxRedirects: 0,
      });
    } catch {
      throw new Error("Custom Scout collection failed or timed out.");
    }
    if (response.status < 200 || response.status >= 300) throw customProviderFailure(response.status);
    try {
      return envelopeSchema.parse(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(response.buffer))).items;
    } catch {
      throw new Error("Invalid or oversized Custom Scout source response.");
    }
  }
}

function mockAllowed() {
  return (
    process.env.NODE_ENV === "test" ||
    (process.env.NODE_ENV !== "production" && process.env.ENABLE_MOCK_SCOUTS === "true")
  );
}

export function scoutProviderKind(): ScoutDataProvider["kind"] {
  const kind = process.env.SCOUT_DATA_PROVIDER || "apify";
  if (kind !== "apify" && kind !== "custom" && kind !== "mock")
    throw new Error("Unsupported Scout data provider configuration.");
  return kind;
}

async function customToken(tenantId: string) {
  const [{ db }, { apiKeys }, { and, eq }, { decrypt }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema"),
    import("drizzle-orm"),
    import("@/lib/crypto"),
  ]);
  const row = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "scout-data")),
  });
  if (!row || row.status !== "active") throw new Error("Missing active provider credential.");
  return decrypt(row.encryptedKey, tenantId);
}

/** Credentials are resolved per workspace per call, never globally cached. */
export async function getScoutDataProvider(
  tenantId: string,
  source?: ScoutCollectionRequest
): Promise<ScoutDataProvider> {
  if (!tenantId) throw new Error("Scout collection requires a workspace.");
  if (source) validateScoutSource(source.targetUrl, source.platform);
  if (source?.platform === "rss") return new RssScoutProvider();
  const kind = scoutProviderKind();
  if (kind === "mock") {
    if (!mockAllowed()) throw new Error("Mock Scout collection is disabled in production.");
    return new MockScoutProvider();
  }
  if (kind === "custom") {
    const endpoint = customEndpoint();
    try {
      return new CustomScoutProvider(endpoint, await customToken(tenantId));
    } catch {
      throw new Error(
        "Connect an active Custom Scout provider key in Settings. No shared credential fallback is available."
      );
    }
  }
  try {
    return new ApifyScoutProvider(await resolveToken(tenantId));
  } catch {
    if (mockAllowed()) return new MockScoutProvider();
    throw new Error(
      "Apify integration not configured. Please add an active Apify API token in Integrations to enable live scout monitoring."
    );
  }
}

export async function getScoutProviderSetup(tenantId: string, source?: ScoutCollectionRequest) {
  let provider: ScoutDataProvider["kind"] | "unconfigured" = "unconfigured";
  try {
    provider = source?.platform === "rss" ? "rss" : scoutProviderKind();
    const resolved = await getScoutDataProvider(tenantId, source);
    return { ready: true, provider: resolved.kind, customEnabled: provider === "custom" };
  } catch (error) {
    return {
      ready: false,
      provider,
      customEnabled: provider === "custom",
      issue: error instanceof Error ? error.message : "Scout provider is unavailable.",
    };
  }
}
