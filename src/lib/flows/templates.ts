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
          model: "gpt-5.6-luna",
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
          model: "gpt-5.6-luna",
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
          model: "gpt-5.6-luna",
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
    name: "Comment Reply Suggestions",
    description:
      "When Zernio reports a new comment, AI suggests a reply for approval and saves it to Notifications. Copy the approved text into Engagement to send it. Requires OpenAI and a Zernio webhook.",
    category: "engagement",
    graph: {
      nodes: [
        node("t1", "trigger.webhook", 0, { eventName: "comment.received" }),
        node("a1", "ai.llm", 260, {
          provider: "openai",
          model: "gpt-5.6-luna",
          systemPrompt:
            "Draft a short, warm, on-brand reply to this comment. Max 2 sentences. Plain text.",
          userTemplate: "{{input}}",
        }),
        node("g1", "logic.approval", 520, {
          prompt: "Approve this suggestion? It will be saved to Notifications for you to send from Engagement.",
        }),
        node("n1", "action.notify", 760, {
          title: "Reply suggestion ready",
          messageTemplate: "Approved reply: {{input}}",
        }),
      ],
      edges: [edge("t1", "a1"), edge("a1", "g1"), edge("g1", "n1")],
    },
  },
  {
    slug: "blog-social-syndication", name: "Blog → Social Syndication", description: "Turns recent RSS entries into approval-ready social drafts.", category: "content",
    graph: { nodes: [
      node("t1", "trigger.schedule", 0, { intervalMinutes: 360 }),
      node("r1", "data.rss", 220, { url: "https://yourblog.com/feed.xml", limit: 10 }),
      node("a1", "ai.llm", 460, { provider: "openai", model: "gpt-5.6-luna", systemPrompt: "Write a concise, original LinkedIn take on this article. Include the source link and output plain text.", userTemplate: "{{input}}" }),
      node("d1", "action.create_draft", 720, { platform: "linkedin" }),
    ], edges: [edge("t1", "r1"), edge("r1", "a1"), edge("a1", "d1")] },
  },
  {
    slug: "youtube-repurposer", name: "YouTube → Social Repurposer", description: "Turns a Supadata transcript into an approval-ready post using OpenRouter.", category: "repurpose",
    graph: { nodes: [
      node("t1", "trigger.manual", 0, { samplePayload: JSON.stringify({ url: "https://www.youtube.com/watch?v=VIDEO_ID" }) }),
      node("y1", "ai.youtube_transcript", 240, { videoUrlField: "url" }),
      node("a1", "ai.llm", 500, { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct", systemPrompt: "Turn this transcript into a sharp X thread opener under 280 characters.", userTemplate: "{{input}}" }),
      node("d1", "action.create_draft", 760, { platform: "twitter" }),
    ], edges: [edge("t1", "y1"), edge("y1", "a1"), edge("a1", "d1")] },
  },
  {
    slug: "daily-branded-image-post", name: "Daily Image Post", description: "Generates an image and caption for the approval queue every day.", category: "content",
    graph: { nodes: [
      node("t1", "trigger.schedule", 0, { intervalMinutes: 1440 }),
      node("a1", "ai.llm", 240, {
        provider: "openai",
        model: "gpt-5.6-luna",
        systemPrompt: "Generate a daily social media post idea with an image prompt and an engaging caption.",
        outputSchema: JSON.stringify({
          type: "object",
          properties: {
            imagePrompt: { type: "string" },
            caption: { type: "string" },
          },
          required: ["imagePrompt", "caption"],
        }),
      }),
      node("i1", "ai.image", 500, { prompt: "{{input.imagePrompt}}", size: "1024x1024", quality: "medium" }),
      node("d1", "action.create_draft", 760, { platform: "facebook", contentField: "caption", mediaUrlField: "imageUrl" }),
    ], edges: [edge("t1", "a1"), edge("a1", "i1"), edge("a1", "d1"), edge("i1", "d1")] },
  },
  {
    slug: "instagram-theme-image", name: "Instagram Theme Image", category: "content",
    description: "Turn a topic into an original image and Instagram caption in Drafts. Set your niche in Manual start, connect OpenAI and asset storage, and select an Instagram account in Create Draft. Run manually before adding a schedule.",
    graph: { nodes: [
      node("t1", "trigger.manual", 0, { samplePayload: JSON.stringify({ niche: "Everyday astronomy", topic: "Why the Moon looks different each night", audience: "Curious beginners" }) }),
      node("a1", "ai.llm", 240, {
        provider: "openai", model: "gpt-5.6-luna",
        systemPrompt: "Create one educational Instagram image post for the supplied niche, topic and audience. Use established facts only; do not invent news, quotes or sources. Caption must be under 1800 characters, with a clear hook and useful explanation. Image prompt should describe an original, legible illustration without text or logos. Return imagePrompt and caption.",
        userTemplate: "{{input}}",
        outputSchema: JSON.stringify({ type: "object", properties: { imagePrompt: { type: "string" }, caption: { type: "string", maxLength: 1800 } }, required: ["imagePrompt", "caption"] }),
      }),
      node("i1", "ai.image", 500, { prompt: "{{input.imagePrompt}}", size: "1024x1024", quality: "medium" }),
      node("d1", "action.create_draft", 760, { platform: "instagram", contentField: "caption", mediaUrlField: "imageUrl" }),
    ], edges: [edge("t1", "a1"), edge("a1", "i1"), edge("a1", "d1"), edge("i1", "d1")] },
  },
  {
    slug: "tiktok-video-caption", name: "TikTok Video Caption", category: "repurpose",
    description: "Draft a caption for your finished video. Replace the sample URL and describe your clip in Manual start, connect OpenAI, and choose a TikTok account in Create Draft. Uses your uploaded MP4; does not generate or edit video.",
    graph: { nodes: [
      node("t1", "trigger.manual", 0, { samplePayload: JSON.stringify({ mediaUrls: ["https://example.com/replace-with-your-video.mp4"], description: "Replace with an accurate description of your finished clip", audience: "Your target audience" }) }),
      node("a1", "ai.llm", 260, {
        provider: "openai", model: "gpt-5.6-luna",
        systemPrompt: "Write a TikTok caption under 1500 characters based only on the supplied clip description and audience. You cannot watch the video; do not invent visible details or claims. Do not change or return media URLs. Return JSON with caption only.",
        userTemplate: "{{input}}",
        outputSchema: JSON.stringify({ type: "object", properties: { caption: { type: "string", maxLength: 1500 } }, required: ["caption"], additionalProperties: false }),
      }),
      node("d1", "action.create_draft", 540, { platform: "tiktok", contentField: "caption", mediaUrlField: "mediaUrls" }),
    ], edges: [edge("t1", "a1"), edge("t1", "d1"), edge("a1", "d1")] },
  },
  {
    slug: "ab-hook-tester", name: "A/B Hook Tester", description: "Deterministically routes runs between statement and question hooks.", category: "testing",
    graph: { nodes: [
      node("t1", "trigger.manual", 0, {}),
      node("a1", "ai.llm", 240, { provider: "openai", model: "gpt-5.6-luna", systemPrompt: "Write one bold hook under 150 characters." }),
      node("sp", "logic.split", 480, { aWeightPercent: 50 }),
      node("v1", "ai.llm", 720, { provider: "openai", model: "gpt-5.6-luna", systemPrompt: "Rewrite this as a curiosity question under 150 characters.", userTemplate: "{{input}}" }),
      node("d1", "action.create_draft", 960, { platform: "twitter" }), node("d2", "action.create_draft", 960, { platform: "twitter" }),
    ], edges: [edge("t1", "a1"), edge("a1", "sp"), edge("sp", "d1", "a"), edge("sp", "v1", "b"), edge("v1", "d2")] },
  },
];
