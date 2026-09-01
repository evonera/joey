import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { sourceItems } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "source",
  "feature",
  "share_id",
]);

/**
 * Normalizes a URL by stripping tracking parameters, sorting remaining query params,
 * and normalizing protocol/trailing slashes.
 */
export function normalizeCanonicalUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = ""; // remove anchor

    // Remove tracking query parameters
    const cleanedParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        cleanedParams.append(key, value);
      }
    }
    cleanedParams.sort();
    parsed.search = cleanedParams.toString();

    let clean = parsed.toString().toLowerCase();
    if (clean.endsWith("/") && parsed.pathname !== "/") {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Computes SHA-256 hash for a normalized canonical URL.
 */
export function hashCanonicalUrl(rawUrl: string): string {
  const normalized = normalizeCanonicalUrl(rawUrl);
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Normalizes text body content by stripping HTML, collapsing whitespace,
 * lowercasing, and removing punctuation noise.
 */
export function normalizeContentBody(body: string): string {
  return body
    .replace(/<[^>]*>/g, " ") // strip HTML tags
    .replace(/http[s]?:\/\/\S+/g, "") // strip URLs
    .replace(/[^\w\s]/gi, "") // strip punctuation
    .toLowerCase()
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

/**
 * Computes SHA-256 hash for normalized content body.
 */
export function hashContentBody(body: string): string {
  const normalized = normalizeContentBody(body);
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Checks if an item is a duplicate in the database by URL hash or content hash.
 */
export async function checkItemDuplicate(
  themePageId: string,
  url?: string,
  body?: string
): Promise<{ isDuplicate: boolean; reason?: "url" | "content"; existingId?: string }> {
  const urlHash = url ? hashCanonicalUrl(url) : null;
  const bodyHash = body && body.length > 50 ? hashContentBody(body) : null;

  if (urlHash) {
    const existingByUrl = await db.query.sourceItems.findFirst({
      where: and(
        eq(sourceItems.themePageId, themePageId),
        eq(sourceItems.canonicalUrlHash, urlHash)
      ),
    });
    if (existingByUrl) {
      return { isDuplicate: true, reason: "url", existingId: existingByUrl.id };
    }
  }

  if (bodyHash) {
    const existingByContent = await db.query.sourceItems.findFirst({
      where: and(
        eq(sourceItems.themePageId, themePageId),
        eq(sourceItems.contentHash, bodyHash)
      ),
    });
    if (existingByContent) {
      return { isDuplicate: true, reason: "content", existingId: existingByContent.id };
    }
  }

  return { isDuplicate: false };
}
