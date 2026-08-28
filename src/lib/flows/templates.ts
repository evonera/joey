import type { FlowGraphDoc } from "./types";

export type OfficialTemplate = {
  slug: string;
  name: string;
  description: string;
  category: string;
  graph: FlowGraphDoc;
};

function node(
  id: string,
  type: string,
  x: number,
  config: Record<string, unknown>,
): FlowGraphDoc["nodes"][number] {
  return { id, type, config, position: { x, y: 200 } };
}

const edge = (from: string, to: string, branch?: string): FlowGraphDoc["edges"][number] => ({ from, to, ...(branch ? { branch } : {}) });

export const officialTemplates: OfficialTemplate[] = [
  {
    slug: "competitor-intelligence",
    name: "Competitor Intelligence → Drafts",
    description:
      "Scrape a competitor's Instagram posts via Apify, keep the top performers by views, have AI extract winning hooks and angles, then write a voice-matched post into your approval queue.",
    category: "research",
    graph: {
      nodes: [
        node("t1", "trigger.manual", 0, {}),
        node("s1", "data.apify_actor", 240, {
          actorId: "apify/instagram-scraper",
          inputJson:
            '{"directUrls":["https://www.instagram.com/COMPETITOR_HANDLE/"],"resultsType":"posts","resultsLimit":40}',
        }),
        node("f1", "transform.sort", 480, { field: "viewCount", direction: "desc", limit: 10 }),
        node("a1", "ai.llm", 720, {
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          systemPrompt:
            "You are a content strategist. From these competitor posts, identify the top hooks, recurring topics and engagement patterns. Return JSON with keys: patterns (string[]), bestHooks (string[]), gaps (string[]).",
          outputSchema:
            '{"type":"object","properties":{"patterns":{"type":"array","items":{"type":"string"}},"bestHooks":{"type":"array","items":{"type":"string"}},"gaps":{"type":"array","items":{"type":"string"}}},"required":["patterns","bestHooks"]}',
        }),
        node("a2", "ai.llm", 960, {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt:
            "Write one social post for Twitter/X inspired by the research. Include a scroll-stopping hook first line, one concrete insight, and a soft CTA. Plain text only.",
          userTemplate: "Research findings:\n{{input}}",
        }),
        node("d1", "action.create_draft", 1200, { platform: "twitter" }),
      ],
      edges: [edge("t1", "s1"), edge("s1", "f1"), edge("f1", "a1"), edge("a1", "a2"), edge("a2", "d1")],
    },
  },
  {
    slug: "hook-mining",
    name: "Hook Mining",
    description:
      "Pull your own recent posts, rank them, and let AI surface the hook styles that actually worked — delivered to your notifications.",
    category: "research",
    graph: {
      nodes: [
        node("t1", "trigger.manual", 0, {}),
        node("s1", "data.apify_actor", 240, {
          actorId: "apify/instagram-scraper",
          inputJson:
            '{"directUrls":["https://www.instagram.com/YOUR_HANDLE/"],"resultsType":"posts","resultsLimit":40}',
        }),
        node("f1", "transform.filter", 480, { field: "type", operator: "contains", value: "video" }),
        node("s2", "transform.sort", 700, { field: "likeCount", direction: "desc", limit: 10 }),
        node("a1", "ai.llm", 920, {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt:
            "Extract the opening hook (first ~12 words) of each post and cluster the recurring hook styles. Return JSON: hooks (string[]), styles (string[]).",
          outputSchema:
            '{"type":"object","properties":{"hooks":{"type":"array","items":{"type":"string"}},"styles":{"type":"array","items":{"type":"string"}}},"required":["hooks"]}',
        }),
        node("n1", "action.notify", 1140, {
          title: "Your winning hooks",
          messageTemplate: "Top hook styles found:\n{{input}}",
        }),
      ],
      edges: [edge("t1", "s1"), edge("s1", "f1"), edge("f1", "s2"), edge("s2", "a1"), edge("a1", "n1")],
    },
  },
  {
    slug: "daily-news-curator",
    name: "Daily News Curator",
    description:
      "Runs daily: searches the web for news in your niche via Exa, drafts a timely take, and drops it in your approval queue.",
    category: "content",
    graph: {
      nodes: [
        node("t1", "trigger.schedule", 0, { intervalMinutes: 1440 }),
        node("w1", "data.exa_search", 240, {
          query: "latest AI social media marketing news {{input}}",
          numResults: 5,
          category: "news",
        }),
        node("a1", "ai.llm", 500, {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt:
            "Pick the single most interesting story for an indie hacker audience. Write a short LinkedIn post about it: what happened, why it matters, one takeaway. No hashtags.",
          userTemplate: "Search results:\n{{input}}",
        }),
        node("d1", "action.create_draft", 760, { platform: "linkedin" }),
      ],
      edges: [edge("t1", "w1"), edge("w1", "a1"), edge("a1", "d1")],
    },
  },
  {
    slug: "comment-responder",
    name: "AI Comment Responder (with approval)",
    description:
      "When Zernio reports a new comment, AI drafts a reply in your brand voice. The reply waits at an approval gate before anything is sent.",
    category: "engagement",
    graph: {
      nodes: [
        node("t1", "trigger.webhook", 0, { eventName: "comment.received" }),
        node("a1", "ai.llm", 260, {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt:
            "Draft a short, warm, on-brand reply to this comment. Max 2 sentences. Plain text.",
          userTemplate: "{{input}}",
        }),
        node("g1", "logic.approval", 520, {
          prompt: "Approve this reply? It will be sent from your account.",
        }),
        node("n1", "action.notify", 760, {
          title: "Reply approved",
          messageTemplate: "Approved reply: {{input}}",
        }),
      ],
      edges: [edge("t1", "a1"), edge("a1", "g1"), edge("g1", "n1")],
    },
  },
  {
    slug: "blog-social-syndication",
    name: "Blog → Social Syndication",
    description:
      "Watches your blog's RSS feed, skips already-seen posts via dedupe, writes a LinkedIn take and a punchy X hook, and drops both in your approval queue.",
    category: "content",
    graph: {
      nodes: [
        node("t1", "trigger.schedule", 0, { intervalMinutes: 360 }),
        node("r1", "data.rss", 220, {
          url: "https://yourblog.com/feed.xml",
          limit: 10,
        }),
        node("a1", "ai.llm", 460, {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt:
            "From this blog post write TWO versions separated by the line '---'. Version 1: LinkedIn post (story-driven, <=1200 chars). Version 2: X/Twitter post (<=250 chars, one hook + link). Return plain text only.",
          userTemplate: "Post:\n{{input}}",
        }),
        node("d1", "action.create_draft", 720, { platform: "linkedin" }),
      ],
      edges: [edge("t1", "r1"), edge("r1", "a1"), edge("a1", "d1")],
    },
  },
  {
    slug: "youtube-repurposer",
    name: "YouTube → Multi-Platform Repurposer",
    description:
      "Grabs a YouTube video's transcript via Supadata, then AI writes platform-tuned variants (LinkedIn story + X thread opener) into your approval queue. Set your video URL in the manual trigger's sample payload before running.",
    category: "repurpose",
    graph: {
      nodes: [
        node("t1", "trigger.manual", 0, {
          samplePayload: JSON.stringify({ url: "https://www.youtube.com/watch?v=REPLACE_WITH_VIDEO_ID" }),
        }),
        node("y1", "ai.youtube_transcript", 240, { videoUrlField: "url" }),
        node("a1", "ai.llm", 500, {
          provider: "openrouter",
          model: "meta-llama/llama-3.3-70b-instruct",
          systemPrompt:
            "Repurpose this video transcript into two posts separated by '---'. LINKEDIN: narrative format with a strong first line, <=1300 chars. X THREAD OPENER: single tweet <=280 chars ending with '🧵'.",
          userTemplate: "Title: {{input}}",
        }),
        node("d1", "action.create_draft", 780, { platform: "twitter" }),
      ],
      edges: [edge("t1", "y1"), edge("y1", "a1"), edge("a1", "d1")],
    },
  },
  {
    slug: "daily-branded-image-post",
    name: "Daily Branded Image Post",
    description:
      "Every morning: AI picks today's topic from your niche, generates a branded image (gpt-image-1), saves it to your asset library, and queues an image post for approval.",
    category: "content",
    graph: {
      nodes: [
        node("t1", "trigger.schedule", 0, { intervalMinutes: 1440 }),
        node("a1", "ai.llm", 240, {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt:
            "Invent ONE concrete, scroll-stopping social post idea for an indie-hacker audience. Output ONLY the image prompt: describe the visual scene, style (flat illustration, indigo palette), and overlay text.",
        }),
        node("i1", "ai.image", 500, {
          prompt: "{{input}}",
          size: "1024x1024",
          quality: "medium",
        }),
        node("a2", "ai.llm", 760, {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt:
            "Write a short caption (<=200 chars) to accompany this image on Instagram. Reference the image concept but let it speak. No hashtags.",
          userTemplate: "{{input}}",
        }),
        node("d1", "action.create_draft", 1020, { platform: "facebook" }),
      ],
      edges: [
        edge("t1", "a1"), edge("a1", "i1"),
        edge("i1", "a2"), edge("a2", "d1"),
      ],
    },
  },
  {
    slug: "ab-hook-tester",
    name: "A/B Hook Tester",
    description:
      "AI writes two competing hooks, then an A/B split randomly routes each run down branch a or b — over time your approval queue shows which style you actually prefer.",
    category: "testing",
    graph: {
      nodes: [
        node("t1", "trigger.manual", 0, {}),
        node("a1", "ai.llm", 240, {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt:
            "Write ONE bold contrarian hook (<=150 chars) about building products with AI agents. No hashtags.",
        }),
        node("sp", "logic.split", 480, { aWeightPercent: 50 }),
        node("v1", "ai.llm", 720, {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt:
            "Rewrite this hook as a QUESTION that creates curiosity. Keep <=150 chars. Output only the hook.",
          userTemplate: "{{input}}",
        }),
        node("d1", "action.create_draft", 960, { platform: "twitter" }),
        node("d2", "action.create_draft", 1200, { platform: "twitter" }),
      ],
      edges: [
        edge("t1", "a1"), edge("a1", "sp"),
        edge("sp", "d1", "a"),   // statement hook
        edge("sp", "v1", "b"),   // question variant → draft
        edge("v1", "d2"),
      ],
    },
  },
];
