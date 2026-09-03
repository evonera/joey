import { z } from "zod";

// Pure, dependency-free node schemas + palette metadata. Safe to import from
// client components; execution implementations stay behind flows/registry.

export const manualTriggerConfig = z.object({
  samplePayload: z.string().optional().describe("Optional JSON passed downstream as the starting data"),
});

export const scheduleTriggerConfig = z.object({
  intervalMinutes: z
    .number()
    .int()
    .min(5)
    .max(10080)
    .default(1440)
    .describe("Run every N minutes (5 min – 7 days)"),
});
export type ScheduleTriggerConfigT = z.infer<typeof scheduleTriggerConfig>;

export const webhookTriggerConfig = z.object({
  eventName: z
    .enum(["comment.received", "mention.received", "webhook.test"])
    .describe("Zernio event that starts this flow"),
});

export const incomingWebhookTriggerConfig = z.object({});

export const filterConfig = z.object({
  field: z.string().describe("Item field to test (dot paths allowed, e.g. metrics.views)"),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "exists"]),
  value: z.string().optional().describe("Comparison value (compared as number when both sides are numeric)"),
});

export const sortTopNConfig = z.object({
  field: z.string().describe("Item field to sort by"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(500).optional().describe("Keep only the top N items"),
});

export const dedupeConfig = z.object({
  field: z.string().describe("Item field that must be unique (dot paths allowed)"),
});

export const conditionConfig = z.object({
  field: z.string().describe("Field on the incoming data to test"),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "exists"]),
  value: z.string().optional(),
});

export const loopConfig = z.object({
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Cap how many items are processed per run"),
});

export const approvalGateConfig = z.object({
  prompt: z
    .string()
    .describe("What the user is being asked to approve, e.g. 'Post this thread to X?'"),
});

export const llmTaskConfig = z.object({
  provider: z.enum(["openai", "anthropic", "openrouter"]).default("openai"),
  model: z
    .string()
    .default("gpt-4o-mini")
    .describe("Model id, e.g. gpt-4o-mini, gpt-4o, claude-sonnet-4-5"),
  systemPrompt: z.string().describe("What this step should do (the system prompt)"),
  userTemplate: z
    .string()
    .optional()
    .describe("User prompt; {{input}} inserts the incoming data as JSON"),
  outputSchema: z
    .string()
    .optional()
    .describe("Optional JSON Schema for structured output"),
  maxTokens: z.number().int().min(64).max(8192).optional(),
});

export const transcribeConfig = z.object({
  mediaUrlField: z
    .string()
    .optional()
    .describe("Field of the incoming item holding the audio/video URL (blank = input is the URL)"),
  language: z.string().optional().describe("ISO code hint, e.g. en"),
});

export const imageGenConfig = z.object({
  prompt: z.string().min(1),
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
});
export const saveAssetConfig = z.object({ urlField: z.string().optional(), filename: z.string().optional() });
export const youtubeTranscriptConfig = z.object({ videoUrlField: z.string().optional() });
export const telegramSendConfig = z.object({ chatId: z.string().min(1), messageTemplate: z.string().min(1).max(4096) });
export const themeStudioRunConfig = z.object({ themePageId: z.string().min(1) });

export const createDraftConfig = z.object({
  platform: z.enum(["twitter", "linkedin", "facebook"]).default("twitter"),
  contentField: z
    .string()
    .optional()
    .describe("Field of the incoming data holding the post text (blank = use the whole input)"),
  mediaUrlField: z
    .string()
    .optional()
    .describe("Field of the incoming data holding image/video URL(s) (blank = auto-detect from input)"),
  accountId: z.string().optional().describe("Connected account id (blank = tenant default)"),
});

export const notifyConfig = z.object({
  title: z.string().default("Flow update").describe("Notification title"),
  messageTemplate: z
    .string()
    .optional()
    .describe("Body text; {{input}} inserts the incoming data as JSON"),
});

export const apifyActorConfig = z.object({
  actorId: z
    .string()
    .describe("Apify actor id, e.g. apify/instagram-scraper or shu8hvrXbJbY3Eb9W"),
  inputJson: z
    .string()
    .describe('Actor input as JSON, e.g. {"directUrls":["https://instagram.com/handle"],"resultsLimit":40}'),
  timeoutSeconds: z.number().int().min(30).max(300).default(180),
});

export const exaSearchConfig = z.object({
  query: z.string().describe("Search query ({{input}} inserts incoming data as text)"),
  numResults: z.number().int().min(1).max(20).default(5),
  includeDomains: z.array(z.string()).optional().describe("Optional domains to include, e.g. ['espn.com', 'nba.com']"),
  excludeDomains: z.array(z.string()).optional().describe("Optional domains to exclude"),
  category: z
    .enum(["news", "company", "research paper", "github", "tweet", "pdf"])
    .optional()
    .describe("Exa category filter"),
});

export const tavilySearchConfig = z.object({
  query: z.string().describe("Search query ({{input}} inserts incoming data as text)"),
  searchDepth: z.enum(["basic", "advanced"]).default("basic"),
  maxResults: z.number().int().min(1).max(20).default(5),
  includeAnswer: z.boolean().default(true),
});

export const httpConfig = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  url: z.string().url().or(z.string().includes("{{input}}")),
  headersJson: z.string().optional(),
  bodyJson: z.string().optional(),
  timeoutMs: z.number().int().min(1_000).max(60_000).default(30_000),
  maxResponseBytes: z.number().int().min(1_024).max(10 * 1024 * 1024).default(5 * 1024 * 1024),
});
export const rssConfig = z.object({ url: z.string().url(), limit: z.number().int().min(1).max(100).default(20) });
export const redditConfig = z.object({ subreddit: z.string(), sort: z.enum(["hot", "new", "top"]).default("hot"), limit: z.number().int().min(1).max(50).default(10) });
export const splitConfig = z.object({ aWeightPercent: z.number().int().min(0).max(100).default(50) });

export type CatalogMeta = {
  type: string;
  category: "trigger" | "data" | "transform" | "ai" | "action" | "logic";
  label: string;
  description: string;
  inputs: string[];
  outputs: string[];
  isTrigger?: boolean;
  forEach?: boolean;
  configSchema: z.ZodTypeAny;
};

export const NODE_CATALOG: CatalogMeta[] = [
  { type: "trigger.manual", category: "trigger", label: "Manual start", description: "Starts the flow when run manually (or on a schedule you set).", inputs: [], outputs: ["data"], isTrigger: true, configSchema: manualTriggerConfig },
  { type: "trigger.schedule", category: "trigger", label: "Schedule", description: "Runs the flow on a fixed interval while the flow is active.", inputs: [], outputs: ["data"], isTrigger: true, configSchema: scheduleTriggerConfig },
  { type: "trigger.webhook", category: "trigger", label: "Zernio webhook", description: "Starts the flow when Zernio sends a matching real-time event (comments, mentions).", inputs: [], outputs: ["event"], isTrigger: true, configSchema: webhookTriggerConfig },
  { type: "trigger.incoming_webhook", category: "trigger", label: "Incoming webhook", description: "Starts this flow when an authenticated JSON request reaches its public webhook URL.", inputs: [], outputs: ["payload"], isTrigger: true, configSchema: incomingWebhookTriggerConfig },
  { type: "data.apify_actor", category: "data", label: "Apify Actor", description: "Runs any Apify actor synchronously and returns its dataset items (scrapes, extracts…). Needs an Apify token in Settings → API Keys.", inputs: ["input"], outputs: ["items"], configSchema: apifyActorConfig },
  { type: "data.exa_search", category: "data", label: "Web Research (Exa)", description: "Neural web search via Exa for research-grade results on a topic. Needs an Exa key in Settings → API Keys.", inputs: ["topic"], outputs: ["results"], configSchema: exaSearchConfig },
  { type: "data.tavily_search", category: "data", label: "Web Research (Tavily)", description: "Fast web search with an LLM-ready answer via Tavily. Needs a Tavily key in Settings → API Keys.", inputs: ["topic"], outputs: ["results"], configSchema: tavilySearchConfig },
  { type: "data.http", category: "data", label: "HTTP Request", description: "Calls REST APIs with bounded SSRF-safe requests.", inputs: ["input"], outputs: ["response"], configSchema: httpConfig },
  { type: "data.rss", category: "data", label: "RSS / Atom feed", description: "Fetches the latest public feed entries.", inputs: [], outputs: ["items"], configSchema: rssConfig },
  { type: "data.reddit", category: "data", label: "Reddit r/", description: "Pulls public subreddit posts.", inputs: [], outputs: ["posts"], configSchema: redditConfig },
  { type: "transform.filter", category: "transform", label: "Filter", description: "Keeps array items matching a condition. Non-array input passes through unchanged.", inputs: ["items"], outputs: ["items"], configSchema: filterConfig },
  { type: "transform.sort", category: "transform", label: "Sort / Top-N", description: "Sorts array items by a field and optionally keeps the top N.", inputs: ["items"], outputs: ["items"], configSchema: sortTopNConfig },
  { type: "transform.dedupe", category: "transform", label: "Dedupe", description: "Removes duplicate array items by a field value.", inputs: ["items"], outputs: ["items"], configSchema: dedupeConfig },
  { type: "logic.condition", category: "logic", label: "Condition", description: "Branches the flow. Connect downstream edges from the 'true' or 'false' handle; non-matching branches are skipped.", inputs: ["data"], outputs: ["true", "false"], configSchema: conditionConfig },
  { type: "logic.loop", category: "logic", label: "For each item", description: "Runs everything downstream once per item of the incoming array, then merges each branch's results into a single list.", inputs: ["items"], outputs: ["item"], forEach: true, configSchema: loopConfig },
  { type: "logic.approval", category: "logic", label: "Approval gate", description: "Pauses the run until you approve or reject in the dashboard. On approve, downstream nodes execute; on reject the run ends.", inputs: ["data"], outputs: ["data"], configSchema: approvalGateConfig },
  { type: "logic.split", category: "logic", label: "A/B split", description: "Deterministically routes a run to branch a or b.", inputs: ["data"], outputs: ["a", "b"], configSchema: splitConfig },
  { type: "ai.llm", category: "ai", label: "AI Task", description: "Runs an LLM over the incoming data. Optionally forces structured JSON via a schema. Spend counts against your LLM budget.", inputs: ["data"], outputs: ["result"], configSchema: llmTaskConfig },
  { type: "ai.transcribe", category: "ai", label: "Transcribe", description: "Downloads an audio/video URL and transcribes it with OpenAI Whisper. Uses your OpenAI key; spend counts against budget.", inputs: ["media"], outputs: ["transcript"], configSchema: transcribeConfig },
  { type: "ai.image", category: "ai", label: "Generate image", description: "Generates and durably stores an image asset.", inputs: ["idea"], outputs: ["image"], configSchema: imageGenConfig },
  { type: "ai.youtube_transcript", category: "ai", label: "YouTube transcript", description: "Fetches a YouTube transcript through Supadata.", inputs: ["video"], outputs: ["transcript"], configSchema: youtubeTranscriptConfig },
  { type: "action.create_draft", category: "action", label: "Create Draft", description: "Creates a draft in your approval queue. Nothing publishes until you approve it — this is how every flow must end.", inputs: ["data"], outputs: ["draft"], configSchema: createDraftConfig },
  { type: "action.notify", category: "action", label: "Notify me", description: "Sends you an in-app notification (and email if your preferences allow).", inputs: ["data"], outputs: ["data"], configSchema: notifyConfig },
  { type: "action.save_asset", category: "action", label: "Save to Assets", description: "Downloads and registers a public file.", inputs: ["file"], outputs: ["asset"], configSchema: saveAssetConfig },
  { type: "action.telegram_send", category: "action", label: "Send Telegram", description: "Queues an idempotent Telegram message.", inputs: ["data"], outputs: ["message"], configSchema: telegramSendConfig },
  { type: "action.theme_studio_run", category: "action", label: "Run Theme Studio recipe", description: "Runs a tenant-scoped Theme Studio editorial recipe and stages compliant packages for human review.", inputs: ["data"], outputs: ["report"], configSchema: themeStudioRunConfig },
];

const metaByType = new Map(NODE_CATALOG.map((m) => [m.type, m]));

export function getNodeMeta(type: string): CatalogMeta | undefined {
  return metaByType.get(type);
}

/** Palette data + form schemas for builder UIs (client-safe). */
export function catalog(): CatalogMeta[] {
  return NODE_CATALOG;
}
