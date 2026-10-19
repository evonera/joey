import { createHash } from "node:crypto";
import { isPublicScoutHttpsUrl } from "./source-validation";

/** The same public video may be exposed as a Short, watch, embed, or share link. */
export function youtubeScoutVideoId(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return undefined;
    const host = url.hostname.toLowerCase();
    const id = host === "youtu.be" ? url.pathname.replace(/^\/|\/$/g, "") :
      ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host) ?
        url.pathname.replace(/\/$/, "") === "/watch" ? url.searchParams.get("v") :
          url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/)?.[1] : undefined;
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch { return undefined; }
}

/** A canonical source link is stable evidence; profile URLs and array positions are not. */
export function canonicalScoutPostUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !isPublicScoutHttpsUrl(value)) return undefined;
  const videoId = youtubeScoutVideoId(value);
  if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || ["fbclid", "igsh", "igshid"].includes(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}
export function scoutPostIdentity(url: string): string {
  const videoId = youtubeScoutVideoId(url);
  return `url:${createHash("sha256").update(videoId ? `https://www.youtube.com/watch?v=${videoId}` : url).digest("hex")}`;
}

/** Normalize only a comparison copy. Historical acquisition receipts stay immutable. */
export function normalizeScoutPostEvidence<T extends { id: string; url: string }>(item: T): T {
  const videoId = youtubeScoutVideoId(item.url);
  if (!videoId) return item;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  return { ...item, id: scoutPostIdentity(url), url };
}

export function sameScoutPostEvidence(a: { id: string; url: string }, b: { id: string; url: string }): boolean {
  const left = normalizeScoutPostEvidence(a), right = normalizeScoutPostEvidence(b);
  return left.id === right.id && left.url === right.url;
}
export function observedMetric(value: unknown): number | undefined {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined;
  const metric = Number(value);
  return Number.isFinite(metric) && metric >= 0 && metric <= 1e12 ? metric : undefined;
}
export function observedTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  // Numeric actor timestamps use seconds; explicit milliseconds remain milliseconds.
  const date = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
