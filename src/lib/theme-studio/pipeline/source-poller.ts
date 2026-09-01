import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { sourceItems, themeSources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { hashCanonicalUrl, hashContentBody, checkItemDuplicate } from "./deduplicator";

export interface NormalizedFeedItem {
  title: string;
  body: string;
  url: string;
  publishedAt?: Date;
  rightsCategory: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parses simple RSS / Atom XML into normalized feed items.
 */
export function parseRssXml(xml: string, defaultRights: string = "unknown"): NormalizedFeedItem[] {
  const items: NormalizedFeedItem[] = [];

  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) ||
                      itemXml.match(/<link[^>]*href=["']([^"']+)["']/i);
    const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ||
                      itemXml.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i) ||
                      itemXml.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
    const dateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
                      itemXml.match(/<published[^>]*>([\s\S]*?)<\/published>/i) ||
                      itemXml.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);

    const title = titleMatch ? titleMatch[1].trim() : "Untitled";
    const url = linkMatch ? (linkMatch[1] || "").trim() : "";
    const body = descMatch ? descMatch[1].replace(/<[^>]*>/g, " ").trim() : title;
    const parsedDate = dateMatch ? new Date(dateMatch[1].trim()) : null;
    const publishedAt = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;

    if (title && url) {
      items.push({
        title,
        body,
        url,
        publishedAt,
        rightsCategory: defaultRights,
      });
    }
  }

  return items;
}

/**
 * Ingests a single theme source, applies deduplication, and persists new items.
 */
export async function pollAndIngestSource(sourceId: string): Promise<{
  sourceId: string;
  ingestedCount: number;
  duplicateCount: number;
  errors?: string[];
}> {
  const source = await db.query.themeSources.findFirst({
    where: eq(themeSources.id, sourceId),
  });

  if (!source || !source.isActive) {
    return { sourceId, ingestedCount: 0, duplicateCount: 0 };
  }

  const items: NormalizedFeedItem[] = [];
  const errors: string[] = [];

  try {
    if (source.sourceType === "rss") {
      const res = await fetch(source.url, {
        headers: { "User-Agent": "JoeyThemeStudioBot/1.0 (+https://eve.dev)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const xml = await res.text();
      items.push(...parseRssXml(xml, source.rightsCategory));
    } else if (source.sourceType === "reddit") {
      const cleanSub = source.url.replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//, "").replace(/^r\//, "").replace(/\/.*$/, "");
      const res = await fetch(`https://www.reddit.com/r/${cleanSub}/hot.json?limit=25`, {
        headers: { "User-Agent": "JoeyThemeStudioBot/1.0" },
      });
      if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
      const data = await res.json();
      const posts = data?.data?.children || [];
      for (const p of posts) {
        const post = p.data;
        if (post && !post.stickied) {
          items.push({
            title: post.title || "",
            body: post.selftext || post.title || "",
            url: `https://reddit.com${post.permalink || ""}`,
            publishedAt: new Date(post.created_utc * 1000),
            rightsCategory: source.rightsCategory,
            metadata: { score: post.score, author: post.author, numComments: post.num_comments },
          });
        }
      }
    } else if (source.sourceType === "http") {
      const res = await fetch(source.url, {
        headers: { "User-Agent": "JoeyThemeStudioBot/1.0" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rawArray = Array.isArray(json) ? json : json.articles || json.data || json.items || [];
      for (const row of rawArray) {
        if (row.title) {
          const rawDate = row.publishedAt || row.published_at || row.date;
          const parsedHttpDate = rawDate ? new Date(rawDate) : null;
          const publishedAt = parsedHttpDate && !isNaN(parsedHttpDate.getTime()) ? parsedHttpDate : undefined;

          let itemUrl = row.url || row.link;
          if (!itemUrl) {
            try {
              const parsed = new URL(source.url);
              parsed.hash = "";
              if (row.id) {
                parsed.searchParams.set("item_id", String(row.id));
              } else {
                const hash = createHash("sha256")
                  .update(row.title + (row.description || row.body || row.summary || ""))
                  .digest("hex")
                  .slice(0, 16);
                parsed.searchParams.set("item_hash", hash);
              }
              itemUrl = parsed.toString();
            } catch {
              const cleanBase = source.url.split("#")[0];
              const sep = cleanBase.includes("?") ? "&" : "?";
              const suffix = row.id
                ? `item_id=${encodeURIComponent(String(row.id))}`
                : `item_hash=${createHash("sha256").update(row.title + (row.description || row.body || row.summary || "")).digest("hex").slice(0, 16)}`;
              itemUrl = `${cleanBase}${sep}${suffix}`;
            }
          }

          items.push({
            title: row.title,
            body: row.description || row.body || row.summary || row.title,
            url: itemUrl,
            publishedAt,
            rightsCategory: source.rightsCategory,
          });
        }
      }
    }
  } catch (err: any) {
    errors.push(err.message || "Failed to fetch feed");
  }

  let ingestedCount = 0;
  let duplicateCount = 0;

  for (const item of items) {
    const dupCheck = await checkItemDuplicate(source.themePageId, item.url, item.body);
    if (dupCheck.isDuplicate) {
      duplicateCount++;
      continue;
    }

    const urlHash = hashCanonicalUrl(item.url);
    const bodyHash = hashContentBody(item.body);

    await db.insert(sourceItems).values({
      tenantId: source.tenantId,
      themePageId: source.themePageId,
      sourceId: source.id,
      title: item.title,
      body: item.body,
      url: item.url,
      canonicalUrlHash: urlHash,
      contentHash: bodyHash,
      publishedAt: item.publishedAt || null,
      rightsCategory: item.rightsCategory || source.rightsCategory || "unknown",
      metadata: item.metadata || {},
      status: "raw",
    });

    ingestedCount++;
  }

  await db.update(themeSources)
    .set({ lastPolledAt: new Date(), updatedAt: new Date() })
    .where(eq(themeSources.id, source.id));

  return {
    sourceId,
    ingestedCount,
    duplicateCount,
    errors: errors.length > 0 ? errors : undefined,
  };
}
