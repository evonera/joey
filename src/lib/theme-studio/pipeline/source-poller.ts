import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { sourceItems, themeSources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { hashCanonicalUrl, hashContentBody, checkItemDuplicate } from "./deduplicator";
import { outboundRequest } from "@/lib/flows/outbound-request";

export interface NormalizedFeedItem {
  title: string;
  body: string;
  url: string;
  publishedAt?: Date;
  rightsCategory: string;
  metadata?: Record<string, unknown>;
}

function publicReferenceUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4_096) return undefined;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function parsedDate(value: unknown): Date | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

export function fallbackItemUrl(sourceUrl: string, row: Record<string, unknown>, title: string, body: string): string | undefined {
  const identityKey = row.id !== undefined && row.id !== null
    ? ["item_id", String(row.id)] as const
    : ["item_hash", createHash("sha256").update(`${title}\n${body}`).digest("hex").slice(0, 16)] as const;
  try {
    const parsed = new URL(sourceUrl);
    parsed.hash = "";
    parsed.searchParams.set(identityKey[0], identityKey[1]);
    return publicReferenceUrl(parsed.toString());
  } catch {
    return undefined;
  }
}

/**
 * Parses simple RSS / Atom XML into normalized feed items.
 */
export function parseRssXml(xml: string, defaultRights: string = "unknown"): NormalizedFeedItem[] {
  const items: NormalizedFeedItem[] = [];

  const itemMatches = (xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || []).slice(0, 100);

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
    const url = publicReferenceUrl(linkMatch ? (linkMatch[1] || "").trim() : "");
    const body = descMatch ? descMatch[1].replace(/<[^>]*>/g, " ").trim() : title;
    const publishedAt = parsedDate(dateMatch?.[1]?.trim());

    if (title && url) {
      items.push({
        title: title.slice(0, 500),
        body: body.slice(0, 20_000),
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
export async function pollAndIngestSource(tenantId: string, sourceId: string, signal?: AbortSignal): Promise<{
  sourceId: string;
  ingestedCount: number;
  duplicateCount: number;
  errors?: string[];
}> {
  const source = await db.query.themeSources.findFirst({
    where: and(eq(themeSources.id, sourceId), eq(themeSources.tenantId, tenantId)),
  });

  if (!source || !source.isActive) {
    return { sourceId, ingestedCount: 0, duplicateCount: 0 };
  }

  const items: NormalizedFeedItem[] = [];
  const errors: string[] = [];

  try {
    if (source.sourceType === "rss") {
      const res = await outboundRequest(source.url, {
        headers: { "User-Agent": "JoeyThemeStudioBot/1.0 (+https://eve.dev)" },
        signal,
        timeoutMs: 20_000,
        maxBytes: 2 * 1024 * 1024,
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      const xml = res.buffer.toString("utf8");
      items.push(...parseRssXml(xml, source.rightsCategory));
    } else if (source.sourceType === "reddit") {
      const cleanSub = source.url.replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//, "").replace(/^r\//, "").replace(/\/.*$/, "");
      if (!/^[A-Za-z0-9_]{2,21}$/.test(cleanSub)) throw new Error("Invalid subreddit name");
      const res = await outboundRequest(`https://www.reddit.com/r/${encodeURIComponent(cleanSub)}/hot.json?limit=25`, {
        headers: { "User-Agent": "JoeyThemeStudioBot/1.0" },
        signal,
        timeoutMs: 20_000,
        maxBytes: 2 * 1024 * 1024,
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`Reddit HTTP ${res.status}`);
      const data = JSON.parse(res.buffer.toString("utf8"));
      const posts = Array.isArray(data?.data?.children) ? data.data.children.slice(0, 25) : [];
      for (const p of posts) {
        const post = p.data;
        if (post && !post.stickied) {
          items.push({
            title: String(post.title || "").slice(0, 500),
            body: String(post.selftext || post.title || "").slice(0, 20_000),
            url: `https://reddit.com${post.permalink || ""}`,
            publishedAt: typeof post.created_utc === "number" ? parsedDate(post.created_utc * 1000) : undefined,
            rightsCategory: source.rightsCategory,
            metadata: { score: post.score, author: post.author, numComments: post.num_comments },
          });
        }
      }
    } else if (source.sourceType === "exa_topic" || source.sourceType === "exa_search") {
      const { searchWithExa } = await import("@/lib/search/exa-client");
      let query = source.url || source.name;
      let includeDomains: string[] | undefined = undefined;

      if (query.includes("domains=")) {
        try {
          const parsed = new URL(query);
          const qParam = parsed.searchParams.get("q") || parsed.searchParams.get("query");
          if (qParam) query = qParam;
          const dParam = parsed.searchParams.get("domains");
          if (dParam) includeDomains = dParam.split(",").map((d) => d.trim()).filter(Boolean);
        } catch {
          // not a full url
        }
      }

      const exaRes = await searchWithExa(
        {
          query,
          includeDomains,
          category: "news",
          numResults: 20,
          signal,
        },
        tenantId,
      );

      for (const res of exaRes.results) {
        if (res.title && res.url) {
          items.push({
            title: res.title.slice(0, 500),
            body: (res.text || res.highlights.join(" ") || res.title).slice(0, 20_000),
            url: res.url,
            publishedAt: parsedDate(res.publishedDate),
            rightsCategory: source.rightsCategory || "news_fair_use",
            metadata: {
              heroImage: res.heroImage,
              imageLinks: res.imageLinks,
              author: res.author,
              highlights: res.highlights,
            },
          });
        }
      }
    } else if (source.sourceType === "http") {
      const res = await outboundRequest(source.url, {
        headers: { "User-Agent": "JoeyThemeStudioBot/1.0" },
        signal,
        timeoutMs: 20_000,
        maxBytes: 2 * 1024 * 1024,
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(res.buffer.toString("utf8"));
      const candidateArray = Array.isArray(json) ? json : json?.articles || json?.data || json?.items || [];
      const rawArray = Array.isArray(candidateArray) ? candidateArray.slice(0, 100) : [];
      for (const candidate of rawArray) {
        const row = candidate && typeof candidate === "object" && !Array.isArray(candidate)
          ? candidate as Record<string, unknown>
          : {};
        const title = typeof row.title === "string" ? row.title.trim() : "";
        const body = String(row.description || row.body || row.summary || title);
        const itemUrl = publicReferenceUrl(row.url ?? row.link) ?? fallbackItemUrl(source.url, row, title, body);
        if (title && itemUrl) {
          items.push({
            title: title.slice(0, 500),
            body: body.slice(0, 20_000),
            url: itemUrl,
            publishedAt: parsedDate(row.publishedAt ?? row.published_at ?? row.date),
            rightsCategory: source.rightsCategory,
          });
        }
      }
    }
  } catch (err: any) {
    signal?.throwIfAborted();
    errors.push(err.message || "Failed to fetch feed");
  }

  let ingestedCount = 0;
  let duplicateCount = 0;

  for (const item of items) {
    signal?.throwIfAborted();
    const freshnessCutoff = Date.now() - source.freshnessWindowHours * 60 * 60 * 1000;
    if (item.publishedAt && item.publishedAt.getTime() < freshnessCutoff) continue;
    const dupCheck = await checkItemDuplicate(tenantId, source.themePageId, item.url, item.body);
    if (dupCheck.isDuplicate) {
      duplicateCount++;
      continue;
    }

    const urlHash = hashCanonicalUrl(item.url);
    const bodyHash = hashContentBody(item.body);

    const inserted = await db.insert(sourceItems).values({
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
    }).onConflictDoNothing().returning({ id: sourceItems.id });

    if (inserted.length > 0) ingestedCount++;
    else duplicateCount++;
  }

  await db.update(themeSources)
    .set({ lastPolledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(themeSources.id, source.id), eq(themeSources.tenantId, tenantId)));

  return {
    sourceId,
    ingestedCount,
    duplicateCount,
    errors: errors.length > 0 ? errors : undefined,
  };
}
