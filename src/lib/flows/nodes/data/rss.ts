import { defineNode } from "../../node-contract";
import { rssConfig } from "../../catalog";

// Minimal RSS 2.0 + Atom parser — no XML dependency. Extracts the common
// fields flows need; unusual feeds may need the HTTP node instead.

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return undefined;
  return decodeEntities(stripCdata(m[1].trim()));
}

export function parseFeed(xml: string, limit: number): Record<string, unknown>[] {
  const itemBlocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  return itemBlocks.slice(0, limit).map((block) => {
    const title = tag(block, "title");
    const link =
      tag(block, "link") ??
      block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ??
      undefined;
    const guid = tag(block, "guid") ?? tag(block, "id") ?? link ?? title;
    const published =
      tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated") ?? undefined;
    const summary =
      tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content") ?? undefined;
    const author = tag(block, "author") ?? tag(block, "dc:creator") ?? undefined;

    return {
      title,
      link,
      guid,
      published,
      summary: summary?.replace(/<[^>]+>/g, "").slice(0, 2000),
      author,
    };
  });
}

export const rssNode = defineNode({
  type: "data.rss",
  category: "data",
  label: "RSS / Atom feed",
  description: "Fetches a feed's latest entries. Blogs, YouTube channels (via RSS), podcasts, news.",
  inputs: [],
  outputs: ["items"],
  configSchema: rssConfig,
  async execute(_input, rawConfig, ctx) {
    const config = rssConfig.parse(rawConfig);

    // SSRF-safe fetch: DNS-pinned to a validated public IP, private/metadata
    // destinations rejected, redirects re-validated per hop, body capped at
    // 5MB within a single overall 60s timeout.
    const { safeRequest } = await import("../ai/transcribe");
    const abortCtrl = new AbortController();
    const timer = setTimeout(() => {
      abortCtrl.abort(new Error("RSS feed request timed out."));
    }, 60_000);

    const onExternalAbort = () => {
      abortCtrl.abort(ctx.signal?.reason ?? new Error("Aborted"));
    };
    if (ctx.signal) {
      if (ctx.signal.aborted) onExternalAbort();
      else ctx.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      let currentUrl = config.url;
      let redirects = 0;
      let xml = "";
      while (redirects <= 5) {
        const { status, headers, buffer } = await safeRequest(currentUrl, {
          method: "GET",
          signal: abortCtrl.signal,
          timeoutMs: 60_000,
          maxBytes: 5 * 1024 * 1024,
          headers: { "User-Agent": "Joey/1.0 (+https://joey.evonera.com)", accept: "*/*" },
        });
        if (status >= 300 && status < 400) {
          const location = Array.isArray(headers.location) ? headers.location[0] : headers.location;
          if (!location) throw new Error(`Feed redirect (${status}) missing location header.`);
          currentUrl = new URL(location, currentUrl).toString();
          redirects++;
          continue;
        }
        if (status < 200 || status >= 300) {
          throw new Error(`Feed returned HTTP ${status}.`);
        }
        xml = buffer.toString("utf8");
        break;
      }
      if (!xml) throw new Error("Feed returned an empty body.");

      return { output: parseFeed(xml, config.limit) };
    } finally {
      clearTimeout(timer);
      if (ctx.signal) ctx.signal.removeEventListener("abort", onExternalAbort);
    }
  },
});
