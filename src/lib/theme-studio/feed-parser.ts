import { sourceMediaCandidates } from "./source-media";

export interface NormalizedFeedItem {
  title: string;
  body: string;
  url: string;
  publishedAt?: Date;
  rightsCategory: string;
  metadata?: Record<string, unknown>;
}

export function publicReferenceUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4_096) return undefined;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parsedDate(value: unknown): Date | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

/**
 * Parses simple RSS / Atom XML into normalized feed items.
 */
export function parseRssXml(xml: string, defaultRights: string = "unknown"): NormalizedFeedItem[] {
  const items: NormalizedFeedItem[] = [];

  const itemMatches = (xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || []).slice(
    0,
    100
  );

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch =
      itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) ||
      itemXml.match(/<link[^>]*href=["']([^"']+)["']/i);
    const descMatch =
      itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ||
      itemXml.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i) ||
      itemXml.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
    const dateMatch =
      itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
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
        metadata: {
          mediaCandidates: sourceMediaCandidates(
            {
              imageLinks: [
                ...itemXml.matchAll(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*url=["']([^"']+)["']/gi),
                ...itemXml.matchAll(/<img\b[^>]*src=["']([^"']+)["']/gi),
              ]
                .filter((match) => !/type=["'](?:audio|video)\//i.test(match[0]))
                .map((match) => match[1]),
            },
            url,
            defaultRights
          ),
        },
      });
    }
  }

  return items;
}
