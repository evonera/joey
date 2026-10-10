import { createHash } from "node:crypto";
import { isPublicScoutHttpsUrl } from "./source-validation";

/** A canonical source link is stable evidence; profile URLs and array positions are not. */
export function canonicalScoutPostUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !isPublicScoutHttpsUrl(value)) return undefined;
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
  return `url:${createHash("sha256").update(url).digest("hex")}`;
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
