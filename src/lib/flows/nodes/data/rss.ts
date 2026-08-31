import { rssConfig } from "../../catalog";
import { defineNode } from "../../node-contract";
import { outboundRequest } from "../../outbound-request";

const decode = (value: string) => value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(?:39|x27);/g, "'");
function tag(block: string, name: string) { return block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.trim(); }

export function parseFeed(xml: string, limit: number): Record<string, unknown>[] {
  return [...xml.matchAll(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi)].slice(0, limit).map(([block]) => {
    const value = (name: string) => { const found = tag(block, name); return found === undefined ? undefined : decode(found); };
    const title = value("title");
    const link = value("link") ?? block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1];
    const summary = value("description") ?? value("summary") ?? value("content");
    return { title, link, guid: value("guid") ?? value("id") ?? link ?? title, published: value("pubDate") ?? value("published") ?? value("updated"), summary: summary?.replace(/<[^>]+>/g, "").slice(0, 2000), author: value("author") ?? value("dc:creator") };
  });
}

export const rssNode = defineNode({
  type: "data.rss", category: "data", label: "RSS / Atom feed", description: "Fetches entries from a public RSS or Atom feed.",
  inputs: [], outputs: ["items"], configSchema: rssConfig,
  async execute(_input, rawConfig, ctx) {
    const config = rssConfig.parse(rawConfig);
    const response = await outboundRequest(config.url, { signal: ctx.signal, timeoutMs: 60_000, maxBytes: 5 * 1024 * 1024, headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "user-agent": "Joey/1.0" } });
    if (response.status < 200 || response.status >= 300) throw new Error(`Feed returned HTTP ${response.status}.`);
    return { output: parseFeed(response.buffer.toString("utf8"), config.limit) };
  },
});
