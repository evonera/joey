import { defineNode } from "../../node-contract";
import { redditConfig } from "../../catalog";

type RedditChild = { data?: Record<string, unknown> };

export const redditNode = defineNode({
  type: "data.reddit",
  category: "data",
  label: "Reddit r/",
  description: "Pulls hot/new/top posts from a public subreddit for trend mining. No key required.",
  inputs: [],
  outputs: ["posts"],
  configSchema: redditConfig,
  async execute(_input, rawConfig, ctx) {
    const config = redditConfig.parse(rawConfig);
    const sub = config.subreddit.replace(/^\/?r\//, "").replace(/\/$/, "");

    const response = await fetch(
      `https://www.reddit.com/r/${encodeURIComponent(sub)}/${config.sort}.json?limit=${config.limit}&raw_json=1`,
      {
        headers: { "User-Agent": "Joey/1.0 (+https://joey.evonera.com)" },
        signal: ctx.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`Reddit returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as { data?: { children?: RedditChild[] } };
    const posts = (data.data?.children ?? []).map((c) => {
      const d = c.data ?? {};
      return {
        title: d.title,
        link: `https://www.reddit.com${String(d.permalink ?? "")}`,
        author: d.author,
        score: d.score,
        numComments: d.num_comments,
        createdUtc: d.created_utc,
        selfText: typeof d.selftext === "string" ? String(d.selftext).slice(0, 2000) : undefined,
        url: d.url,
        subreddit: d.subreddit_name_prefixed ?? `r/${sub}`,
      };
    });

    return { output: posts };
  },
});
