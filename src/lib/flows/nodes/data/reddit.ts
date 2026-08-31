import { redditConfig } from "../../catalog";
import { defineNode } from "../../node-contract";
import { outboundRequest } from "../../outbound-request";

export const redditNode = defineNode({
  type: "data.reddit", category: "data", label: "Reddit r/", description: "Pulls public subreddit posts for trend research.",
  inputs: [], outputs: ["posts"], configSchema: redditConfig,
  async execute(_input, rawConfig, ctx) {
    const config = redditConfig.parse(rawConfig);
    const subreddit = config.subreddit.replace(/^\/?r\//, "").replace(/\/$/, "");
    if (!/^[A-Za-z0-9_]{2,21}$/.test(subreddit)) throw new Error("Invalid subreddit name.");
    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${config.sort}.json?limit=${config.limit}&raw_json=1`;
    const response = await outboundRequest(url, { signal: ctx.signal, timeoutMs: 30_000, maxBytes: 5 * 1024 * 1024, headers: { accept: "application/json", "user-agent": "Joey/1.0" } });
    if (response.status < 200 || response.status >= 300) throw new Error(`Reddit returned HTTP ${response.status}.`);
    const listing = JSON.parse(response.buffer.toString("utf8")) as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
    return { output: (listing.data?.children ?? []).map(({ data = {} }) => ({ title: data.title, link: `https://www.reddit.com${String(data.permalink ?? "")}`, author: data.author, score: data.score, numComments: data.num_comments, createdUtc: data.created_utc, selfText: typeof data.selftext === "string" ? data.selftext.slice(0, 2000) : undefined, url: data.url, subreddit: data.subreddit_name_prefixed ?? `r/${subreddit}` })) };
  },
});
