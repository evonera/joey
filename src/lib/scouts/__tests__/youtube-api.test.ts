// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ outbound: vi.fn(), key: vi.fn(), decrypt: vi.fn(), quota: vi.fn() }));
vi.mock("@/lib/flows/outbound-request", async (original) => ({ ...await original<typeof import("@/lib/flows/outbound-request")>(), outboundRequest: mocks.outbound }));
vi.mock("@/lib/db", () => ({ db: { query: { apiKeys: { findFirst: mocks.key } } } }));
vi.mock("@/lib/crypto", () => ({ decrypt: mocks.decrypt }));
vi.mock("../youtube-quota", () => ({ consumeYoutubeRequest: mocks.quota }));

import { resolveYoutubeScoutKey, YoutubeApiScoutProvider } from "../youtube-api";
import { scoutPostIdentity } from "../post-evidence";

const CHANNEL = "UCaaaaaaaaaaaaaaaaaaaaaa";
const PLAYLIST = "UUaaaaaaaaaaaaaaaaaaaaaa";
const VIDEO = "abcdefghijk";
const source = { platform: "youtube", targetUrl: `https://www.youtube.com/channel/${CHANNEL}` };
const videoSource = { platform: "youtube", targetUrl: `https://www.youtube.com/watch?v=${VIDEO}` };
const channels = { items: [{ id: CHANNEL, contentDetails: { relatedPlaylists: { uploads: PLAYLIST } } }] };
const playlist = { items: [{ snippet: { channelId: CHANNEL, playlistId: PLAYLIST, resourceId: { videoId: VIDEO } }, contentDetails: { videoId: VIDEO } }] };
const video = { id: VIDEO, snippet: { channelId: CHANNEL, title: "Actual upload", description: "Actual description", publishedAt: "2026-10-18T01:02:03Z" }, statistics: { viewCount: "1234", likeCount: "0" } };
const videos = { items: [video] };
function response(value: unknown, status = 200, headers = {}) { return { status, headers, buffer: Buffer.from(JSON.stringify(value)), finalUrl: "https://www.googleapis.com/youtube/v3/videos" }; }
function context() { return { signal: new AbortController().signal, beforePaidPhase: vi.fn(async () => {}) }; }
function provider() { return new YoutubeApiScoutProvider("youtube-secret", "tenant-a"); }
function error(reason: string) { return { error: { message: "never disclose youtube-secret", errors: [{ reason }] } }; }

beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("YOUTUBE_DATA_API_KEY", "server-youtube-secret"); mocks.key.mockResolvedValue(undefined); mocks.decrypt.mockReturnValue("workspace-youtube-secret"); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("YouTube Data API credentials", () => {
  it("uses only an active workspace YouTube key, never a Google AI key", async () => {
    mocks.key.mockResolvedValue({ status: "active", encryptedKey: "encrypted" });
    expect(await resolveYoutubeScoutKey("tenant-a")).toBe("workspace-youtube-secret");
    expect(mocks.decrypt).toHaveBeenCalledWith("encrypted", "tenant-a");
    const config = mocks.key.mock.calls[0][0];
    expect(config.where.queryChunks.length).toBeGreaterThan(0);
  });
  it("uses a server YouTube credential only when the workspace has no saved key", async () => {
    expect(await resolveYoutubeScoutKey("tenant-a")).toBe("server-youtube-secret");
    vi.stubEnv("YOUTUBE_DATA_API_KEY", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "google-ai-is-not-youtube");
    expect(await resolveYoutubeScoutKey("tenant-a")).toBeUndefined();
  });
  it.each(["revoked", "disabled", "invalid"])("fails closed for a %s workspace key despite server fallback", async (status) => {
    mocks.key.mockResolvedValue({ status, encryptedKey: "encrypted" });
    await expect(resolveYoutubeScoutKey("tenant-a")).rejects.toThrow("disabled");
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it("sanitizes credential decryption failures and rejects blank tenants", async () => {
    mocks.key.mockResolvedValue({ status: "active", encryptedKey: "encrypted" });
    mocks.decrypt.mockImplementation(() => { throw new Error("sensitive-secret"); });
    await expect(resolveYoutubeScoutKey("tenant-a")).rejects.toThrow("could not be read");
    await expect(resolveYoutubeScoutKey(" ")).rejects.toThrow("workspace");
  });
});

describe("YouTube Data API acquisition", () => {
  it("resolves channel uploads and retrieves fresh actual metrics with stable feed-compatible IDs", async () => {
    mocks.outbound.mockResolvedValueOnce(response(channels)).mockResolvedValueOnce(response(playlist)).mockResolvedValueOnce(response(videos));
    const ctx = context();
    const items = await provider().fetchRecentPosts(source, ctx);
    const url = `https://www.youtube.com/watch?v=${VIDEO}`;
    expect(items).toEqual([{ id: scoutPostIdentity(url), url, acquisitionProvider: "youtube-data-api", text: "Actual upload\nActual description", timestamp: "2026-10-18T01:02:03.000Z", views: 1234, likes: 0 }]);
    expect(ctx.beforePaidPhase).toHaveBeenCalledTimes(3);
    const endpoints = mocks.outbound.mock.calls.map(([url]) => new URL(url));
    expect(endpoints.map((url) => url.pathname)).toEqual(["/youtube/v3/channels", "/youtube/v3/playlistItems", "/youtube/v3/videos"]);
    expect(endpoints[0].searchParams.get("id")).toBe(CHANNEL);
    expect(endpoints[1].searchParams.get("playlistId")).toBe(PLAYLIST);
    expect(endpoints[2].searchParams.get("id")).toBe(VIDEO);
    expect(endpoints[2].searchParams.has("maxResults")).toBe(false);
    for (const [url, options] of mocks.outbound.mock.calls) {
      expect(url).not.toContain("secret");
      expect(new URL(url).origin).toBe("https://www.googleapis.com");
      expect(options).toMatchObject({ method: "GET", maxRedirects: 0, maxBytes: 2 * 1024 * 1024, headers: { "X-Goog-Api-Key": "youtube-secret" } });
    }
  });
  it.each([["https://youtube.com/@actual.channel/videos", "forHandle", "@actual.channel"], ["https://youtube.com/user/oldname", "forUsername", "oldname"]])("resolves %s through channels.list", async (targetUrl, param, value) => {
    mocks.outbound.mockResolvedValueOnce(response(channels)).mockResolvedValueOnce(response({ items: [] }));
    expect(await provider().fetchRecentPosts({ ...source, targetUrl }, context())).toEqual([]);
    expect(new URL(mocks.outbound.mock.calls[0][0]).searchParams.get(param)).toBe(value);
  });
  it.each([`https://youtu.be/${VIDEO}`, `https://youtube.com/shorts/${VIDEO}`, `https://youtube.com/live/${VIDEO}`, `https://youtube.com/embed/${VIDEO}`, videoSource.targetUrl])("retrieves a direct video %s without feed or channel requests", async (targetUrl) => {
    mocks.outbound.mockResolvedValue(response(videos));
    expect(await provider().fetchRecentPosts({ ...source, targetUrl }, context())).toHaveLength(1);
    expect(mocks.outbound).toHaveBeenCalledTimes(1);
    expect(new URL(mocks.outbound.mock.calls[0][0]).pathname).toBe("/youtube/v3/videos");
  });
  it("keeps missing metrics unknown and reads again on repeated checks", async () => {
    mocks.outbound.mockResolvedValue(response({ items: [{ ...video, statistics: undefined }] }));
    const adapter = provider();
    const first = await adapter.fetchRecentPosts(videoSource, context());
    expect(first[0]).not.toHaveProperty("views");
    expect(first[0]).not.toHaveProperty("likes");
    await adapter.fetchRecentPosts(videoSource, context());
    expect(mocks.outbound).toHaveBeenCalledTimes(2);
  });
  it("rejects unsupported custom channel URLs before any network work", async () => {
    await expect(provider().fetchRecentPosts({ ...source, targetUrl: "https://youtube.com/c/legacy" }, context())).rejects.toThrow("Replace /c/");
    expect(mocks.outbound).not.toHaveBeenCalled();
  });
  it("rejects malformed metadata, foreign video IDs, duplicate IDs and foreign channel evidence", async () => {
    for (const value of [{ items: [{ ...video, snippet: { ...video.snippet, publishedAt: "invalid" } }] }, { items: [{ ...video, id: "foreign1234" }] }, { items: [video, video] }]) {
      mocks.outbound.mockResolvedValue(response(value));
      await expect(provider().fetchRecentPosts(videoSource, context())).rejects.toThrow(/invalid metadata|does not match/);
    }
    mocks.outbound.mockReset().mockResolvedValueOnce(response(channels)).mockResolvedValueOnce(response(playlist)).mockResolvedValueOnce(response({ items: [{ ...video, snippet: { ...video.snippet, channelId: "UCbbbbbbbbbbbbbbbbbbbbbb" } }] }));
    await expect(provider().fetchRecentPosts(source, context())).rejects.toThrow("does not match");
  });
  it("rejects foreign channel lookups and foreign playlist membership", async () => {
    mocks.outbound.mockResolvedValueOnce(response({ items: [{ ...channels.items[0], id: "UCbbbbbbbbbbbbbbbbbbbbbb" }] }));
    await expect(provider().fetchRecentPosts(source, context())).rejects.toThrow("does not match");
    mocks.outbound.mockResolvedValueOnce(response(channels)).mockResolvedValueOnce(response({ items: [{ ...playlist.items[0], snippet: { ...playlist.items[0].snippet, playlistId: "foreignPlaylist" } }] }));
    await expect(provider().fetchRecentPosts(source, context())).rejects.toThrow("do not match");
  });
  it.each(["quotaExceeded", "dailyLimitExceeded", "accessNotConfigured", "keyInvalid", "ipRefererBlocked"])("does not retry or leak upstream details for %s", async (reason) => {
    mocks.outbound.mockResolvedValue(response(error(reason), 403));
    await expect(provider().fetchRecentPosts(videoSource, context())).rejects.toThrow(/quota|access is disabled/);
    expect(mocks.outbound).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500, 502, 503, 504])("retries transient HTTP %s then succeeds with admission on each attempt", async (status) => {
    vi.useFakeTimers();
    mocks.outbound.mockResolvedValueOnce(response(error("backendError"), status)).mockResolvedValueOnce(response(videos));
    const ctx = context();
    const result = provider().fetchRecentPosts(videoSource, ctx);
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toHaveLength(1);
    expect(mocks.outbound).toHaveBeenCalledTimes(2);
    expect(ctx.beforePaidPhase).toHaveBeenCalledTimes(2);
  });
  it("caps retryable rate limits at three attempts", async () => {
    vi.useFakeTimers();
    mocks.outbound.mockResolvedValue(response(error("userRateLimitExceeded"), 403, { "retry-after": "1" }));
    const result = expect(provider().fetchRecentPosts(videoSource, context())).rejects.toThrow("after three attempts");
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    expect(mocks.outbound).toHaveBeenCalledTimes(3);
  });
  it("respects bounded Retry-After and fails instead of retrying too early for long delays", async () => {
    mocks.outbound.mockResolvedValue(response(error("rateLimitExceeded"), 429, { "retry-after": "60" }));
    await expect(provider().fetchRecentPosts(videoSource, context())).rejects.toThrow("longer wait");
    expect(mocks.outbound).toHaveBeenCalledTimes(1);
  });
  it("aborts retry waits without another request", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    mocks.outbound.mockResolvedValue(response(error("rateLimitExceeded"), 429, { "retry-after": "5" }));
    const result = expect(provider().fetchRecentPosts(videoSource, { signal: controller.signal })).rejects.toThrow("cancelled by user");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error("cancelled by user"));
    await result;
    expect(mocks.outbound).toHaveBeenCalledTimes(1);
  });
  it("stops before network work when reservation admission is denied", async () => {
    const ctx = context();
    ctx.beforePaidPhase.mockRejectedValue(new Error("reservation expired"));
    await expect(provider().fetchRecentPosts(videoSource, ctx)).rejects.toThrow("reservation expired");
    expect(mocks.outbound).not.toHaveBeenCalled();
  });
  it("bounds the whole collection even if the admission callback stalls", async () => {
    vi.useFakeTimers();
    const ctx = context();
    ctx.beforePaidPhase.mockImplementation(() => new Promise(() => {}));
    const result = expect(provider().fetchRecentPosts(videoSource, ctx)).rejects.toThrow("40-second deadline");
    await vi.advanceTimersByTimeAsync(40_000);
    await result;
    expect(mocks.outbound).not.toHaveBeenCalled();
  });
  it("bounds the whole collection even if transport stalls", async () => {
    vi.useFakeTimers();
    mocks.outbound.mockImplementation(() => new Promise(() => {}));
    const result = expect(provider().fetchRecentPosts(videoSource, context())).rejects.toThrow("40-second deadline");
    await vi.advanceTimersByTimeAsync(40_000);
    await result;
    expect(mocks.outbound).toHaveBeenCalledTimes(1);
  });
});

describe("YouTube API quota admission", () => {
  it("fails before transport when quota is unavailable", async () => {
    mocks.quota.mockRejectedValue(new Error("YouTube workspace request limit reached."));
    await expect(provider().fetchRecentPosts(videoSource, context())).rejects.toThrow("request limit");
    expect(mocks.quota).toHaveBeenCalledExactlyOnceWith("tenant-a", "youtube-secret");
    expect(mocks.outbound).not.toHaveBeenCalled();
  });
  it("admits every retry and stops before a denied retry", async () => {
    vi.useFakeTimers();
    mocks.outbound.mockResolvedValue(response(error("backendError"), 503));
    mocks.quota.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("YouTube workspace request limit reached."));
    const pending = expect(provider().fetchRecentPosts(videoSource, context())).rejects.toThrow("request limit");
    await vi.runAllTimersAsync();
    await pending;
    expect(mocks.quota).toHaveBeenCalledTimes(2);
    expect(mocks.outbound).toHaveBeenCalledTimes(1);
  });
});

describe("YouTube handle input errors", () => {
  it("reports invalid percent encoding without contacting Google", async () => {
    await expect(provider().fetchRecentPosts({ ...source, targetUrl: "https://www.youtube.com/@bad%ZZ" }, context())).rejects.toThrow("invalid URL encoding");
    expect(mocks.outbound).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });
});
