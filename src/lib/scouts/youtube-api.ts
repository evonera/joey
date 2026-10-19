import { z } from "zod";
import { outboundRequest } from "@/lib/flows/outbound-request";
import { observedMetric, scoutPostIdentity } from "./post-evidence";
import { validateScoutSource } from "./source-validation";
import { consumeYoutubeRequest } from "./youtube-quota";
import type { ScoutCollectionContext, ScoutCollectionRequest, ScoutDataProvider, ScoutPostItem } from "./data-provider";

const API_ORIGIN = "https://www.googleapis.com/youtube/v3/";
const MAX_ITEMS = 15;
const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const videoId = z.string().regex(VIDEO_ID);
const channelId = z.string().regex(CHANNEL_ID);
const channelEnvelope = z.object({ items: z.array(z.object({
  id: channelId,
  contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().regex(/^[\w-]{2,150}$/) }) }),
})).max(1) });
const playlistEnvelope = z.object({ items: z.array(z.object({
  snippet: z.object({ channelId, playlistId: z.string(), resourceId: z.object({ videoId }) }),
  contentDetails: z.object({ videoId }),
})).max(MAX_ITEMS) });
const count = z.string().regex(/^\d+$/).max(30).optional();
const videoEnvelope = z.object({ items: z.array(z.object({
  id: videoId,
  snippet: z.object({ channelId, title: z.string().max(6000), description: z.string().max(100_000).optional(), publishedAt: z.string().datetime({ offset: true }) }),
  statistics: z.object({ viewCount: count, likeCount: count }).optional(),
})).max(MAX_ITEMS) });

/** A workspace credential takes precedence, including an explicit revocation. */
export async function resolveYoutubeScoutKey(tenantId: string): Promise<string | undefined> {
  if (!tenantId.trim()) throw new Error("YouTube collection requires a workspace.");
  const [{ db }, { apiKeys }, { and, eq }, { decrypt }] = await Promise.all([
    import("@/lib/db"), import("@/lib/db/schema"), import("drizzle-orm"), import("@/lib/crypto"),
  ]);
  const row = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "youtube")) });
  if (row) {
    if (row.status !== "active") throw new Error("YouTube workspace API key is disabled. Update it in Settings → Integrations.");
    try {
      const value = decrypt(row.encryptedKey, tenantId).trim();
      if (value && value.length <= 512 && !/[\s\r\n]/.test(value)) return value;
    } catch { /* Never expose encrypted material or key validation details. */ }
    throw new Error("YouTube workspace API key could not be read. Update it in Settings → Integrations.");
  }
  const key = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!key) return undefined;
  if (key.length > 512 || /\s/.test(key)) throw new Error("YouTube server API key is invalid. Check the deployment configuration.");
  return key;
}

function delay(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function withinDeadline<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([work(), cancelled]); }
  finally { if (abort) signal.removeEventListener("abort", abort); }
}

function reasonCodes(buffer: Buffer): string[] {
  try {
    const result = z.object({ error: z.object({ errors: z.array(z.object({ reason: z.string().max(120) })).optional() }) }).parse(JSON.parse(buffer.toString("utf8")));
    return result.error.errors?.map((entry) => entry.reason) ?? [];
  } catch { return []; }
}

function retryWait(header: string | string[] | undefined, attempt: number) {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return 500 * 2 ** attempt;
  const seconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  if (!Number.isFinite(seconds) || seconds > 5000) throw new Error("YouTube rate limit requires a longer wait. Collection will retry at the next scheduled check.");
  return Math.max(0, seconds);
}

/** Fresh, credentialed public metadata. No feed fallback or cached observations. */
export class YoutubeApiScoutProvider implements ScoutDataProvider {
  readonly kind = "youtube" as const;
  constructor(private readonly apiKey: string, private readonly tenantId: string) {
    if (!tenantId?.trim()) throw new Error("YouTube collection requires a workspace.");
    if (!apiKey.trim() || apiKey.length > 512 || /\s/.test(apiKey)) throw new Error("YouTube Data API key is missing or invalid.");
  }

  private async get(endpoint: "channels" | "playlistItems" | "videos", params: Record<string, string>, context: ScoutCollectionContext) {
    const url = new URL(endpoint, API_ORIGIN);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    for (let attempt = 0; attempt < 3; attempt++) {
      context.signal.throwIfAborted();
      await withinDeadline(async () => {
        await context.beforePaidPhase?.();
        await consumeYoutubeRequest(this.tenantId, this.apiKey);
      }, context.signal);
      context.signal.throwIfAborted();
      let response: Awaited<ReturnType<typeof outboundRequest>>;
      try {
        response = await withinDeadline(() => outboundRequest(url.toString(), { method: "GET", headers: { Accept: "application/json", "X-Goog-Api-Key": this.apiKey }, signal: context.signal, timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 0 }), context.signal);
      } catch {
        context.signal.throwIfAborted();
        if (attempt === 2) throw new Error(`YouTube ${endpoint} request failed or timed out after three attempts.`);
        await delay(500 * 2 ** attempt, context.signal);
        continue;
      }
      if (response.status === 200) {
        try { return JSON.parse(response.buffer.toString("utf8")) as unknown; }
        catch { throw new Error(`YouTube ${endpoint} returned invalid metadata.`); }
      }
      const reasons = reasonCodes(response.buffer);
      if (reasons.some((reason) => ["quotaExceeded", "dailyLimitExceeded", "dailyLimitExceededUnreg"].includes(reason))) {
        throw new Error("YouTube Data API daily quota is exhausted. Check Google Cloud quota; no feed fallback was used.");
      }
      if (reasons.some((reason) => ["accessNotConfigured", "serviceDisabled", "keyInvalid", "ipRefererBlocked", "forbidden"].includes(reason))) {
        throw new Error("YouTube Data API access is disabled or the API key is invalid or restricted. Check Google Cloud API and key restrictions.");
      }
      const transient = response.status === 429 || [500, 502, 503, 504].includes(response.status) ||
        (response.status === 403 && reasons.some((reason) => ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason)));
      if (transient && attempt < 2) {
        await delay(retryWait(response.headers["retry-after"], attempt), context.signal);
        continue;
      }
      if (transient) throw new Error(`YouTube ${endpoint} is temporarily unavailable or rate limited after three attempts.`);
      throw new Error(`YouTube ${endpoint} returned HTTP ${response.status}. Check source availability and Data API access.`);
    }
    throw new Error("YouTube collection could not complete.");
  }

  async fetchRecentPosts(request: ScoutCollectionRequest, context: ScoutCollectionContext): Promise<ScoutPostItem[]> {
    context.signal.throwIfAborted();
    if (request.platform !== "youtube") throw new Error("YouTube Data API collection requires a YouTube source.");
    validateScoutSource(request.targetUrl, "youtube");
    const source = new URL(request.targetUrl);
    if (source.port && source.port !== "443") throw new Error("Use a standard HTTPS YouTube source URL.");
    const directId = source.hostname === "youtu.be" ? source.pathname.slice(1) : source.pathname === "/watch" ? source.searchParams.get("v") : source.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/)?.[1];
    const lookup: Record<string, string> = {};
    if (directId) {
      if (!VIDEO_ID.test(directId)) throw new Error("Use a valid YouTube video URL.");
    } else {
      const id = source.pathname.match(/^\/channel\/(UC[\w-]{22})(?:\/(?:videos|shorts|streams))?\/?$/)?.[1];
      const handle = source.pathname.match(/^\/@([^/]+)(?:\/(?:videos|shorts|streams))?\/?$/)?.[1];
      const username = source.pathname.match(/^\/user\/([\w.-]+)(?:\/(?:videos|shorts|streams))?\/?$/)?.[1];
      if (id) lookup.id = id;
      else if (handle) lookup.forHandle = `@${decodeURIComponent(handle)}`;
      else if (username) lookup.forUsername = username;
      else throw new Error("YouTube Data API needs a /channel/UC… or /@handle URL, legacy /user/ URL, or individual video. Replace /c/ custom URLs with the channel handle.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("YouTube collection exceeded its 40-second deadline.")), 40_000);
    const signal = AbortSignal.any([context.signal, controller.signal]);
    const bounded = { ...context, signal };
    try {
      let ids: string[] = directId ? [directId] : [];
      let expectedChannel: string | undefined;
      if (!directId) {
        const channels = channelEnvelope.safeParse(await this.get("channels", { part: "contentDetails", ...lookup }, bounded));
        if (!channels.success) throw new Error("YouTube channels returned invalid metadata.");
        const channel = channels.data.items[0];
        if (!channel) throw new Error("YouTube channel was not found or is unavailable.");
        if (lookup.id && channel.id !== lookup.id) throw new Error("YouTube channel metadata does not match the requested source.");
        expectedChannel = channel.id;
        const uploads = channel.contentDetails.relatedPlaylists.uploads;
        const playlist = playlistEnvelope.safeParse(await this.get("playlistItems", { part: "snippet,contentDetails", playlistId: uploads, maxResults: String(MAX_ITEMS) }, bounded));
        if (!playlist.success) throw new Error("YouTube uploads returned invalid metadata.");
        if (playlist.data.items.some((item) => item.snippet.channelId !== expectedChannel || item.snippet.playlistId !== uploads || item.snippet.resourceId.videoId !== item.contentDetails.videoId)) {
          throw new Error("YouTube uploads do not match the requested channel or playlist.");
        }
        ids = playlist.data.items.map((item) => item.contentDetails.videoId);
        if (new Set(ids).size !== ids.length) throw new Error("YouTube uploads contain duplicate video IDs.");
      }
      if (!ids.length) return [];
      // videos.list does not support maxResults with id; ids are already bounded.
      const videos = videoEnvelope.safeParse(await this.get("videos", { part: "snippet,statistics", id: ids.join(",") }, bounded));
      if (!videos.success) throw new Error("YouTube videos returned invalid metadata.");
      if (videos.data.items.some((video) => !ids.includes(video.id) || (expectedChannel && video.snippet.channelId !== expectedChannel)) || new Set(videos.data.items.map((video) => video.id)).size !== videos.data.items.length) {
        throw new Error("YouTube video metadata does not match the requested source.");
      }
      // Preserve upload playlist order rather than trusting videos.list response order.
      return videos.data.items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).map((video) => {
        const url = `https://www.youtube.com/watch?v=${video.id}`;
        const views = observedMetric(video.statistics?.viewCount);
        const likes = observedMetric(video.statistics?.likeCount);
        return { id: scoutPostIdentity(url), url, acquisitionProvider: "youtube-data-api" as const, text: `${video.snippet.title}${video.snippet.description ? `\n${video.snippet.description}` : ""}`.slice(0, 6000), timestamp: new Date(video.snippet.publishedAt).toISOString(), ...(views !== undefined ? { views } : {}), ...(likes !== undefined ? { likes } : {}) };
      });
    } finally { clearTimeout(timer); }
  }
}
