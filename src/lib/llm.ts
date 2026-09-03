


async function resolveKey(tenantId: string | undefined, provider: string): Promise<string> {
  if (tenantId) {
    const { db } = await import("@/lib/db");
    const { apiKeys } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { decrypt } = await import("@/lib/crypto");
    const tenantKey = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.tenantId, tenantId),
        eq(apiKeys.provider, provider),
      ),
    });
    if (tenantKey) {
      if (tenantKey.status !== "active") {
        throw new Error(`${provider} API key for this workspace is revoked or disabled.`);
      }
      return decrypt(tenantKey.encryptedKey, tenantId);
    }
  }
  const envKey = provider === "anthropic" 
    ? process.env.ANTHROPIC_API_KEY 
    : provider === "openrouter" 
    ? process.env.OPENROUTER_API_KEY 
    : provider === "google"
    ? (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY)
    : process.env.OPENAI_API_KEY;
  if (envKey) return envKey;
  throw new Error(
    `No ${provider} API key available. Add one in Settings → API Keys or set the environment variable.`,
  );
}

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmResult = {
  text: string;
  json?: unknown;
};

/**
 * Tenant-scoped chat completion. Provider keys come from encrypted api_keys
 * rows first (BYOK), falling back to server env. Token usage is recorded
 * against the tenant budget when known.
 */
export async function runLlm(opts: {
  tenantId: string;
  provider: "openai" | "anthropic" | "openrouter" | "google";
  model: string;
  messages: LlmMessage[];
  /** Optional JSON schema (as plain object) to force structured output. */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<LlmResult> {
  const apiKey = await resolveKey(opts.tenantId, opts.provider);

  if (opts.provider === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const system = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = opts.messages.filter((m) => m.role !== "system");
    const response = await client.messages.create(
      {
        model: opts.model,
        max_tokens: opts.maxTokens ?? 2048,
        system: system || undefined,
        messages: rest.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        ...(opts.jsonSchema
          ? {
              tool_choice: { type: "tool", name: "emit_result" },
              tools: [
                {
                  name: "emit_result",
                  description: "Return the structured result",
                  input_schema: opts.jsonSchema as Parameters<never>[0] extends never ? never : Record<string, unknown>,
                },
              ],
            }
          : {}),
      },
      { signal: opts.signal },
    );
    try {
      await recordUsage(opts.tenantId, response.usage.input_tokens, response.usage.output_tokens);
    } catch {
      // budget recording must never fail a flow node
    }
    // Reject incomplete generations: token-limit truncation, refusals, pause turns, and
    // stop-sequence hits must never flow downstream as "successful" output.
    const completeStops = new Set(["end_turn", "tool_use"]);
    if (!response.stop_reason || !completeStops.has(response.stop_reason) || (response as any).stop_reason === "refusal") {
      throw new Error(
        `Anthropic stopped with reason "${response.stop_reason ?? "none"}" — treating it as a failed generation.`,
      );
    }
    if ((response as any).refusal) {
      throw new Error(`Anthropic refused request: ${(response as any).refusal}`);
    }

    let text = "";
    let json: unknown;
    for (const block of response.content) {
      if ((block as any).type === "refusal") {
        throw new Error(`Anthropic refused request: ${(block as any).refusal || (block as any).text}`);
      }
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        json = block.input;
        text = typeof block.input === "string" ? block.input : JSON.stringify(block.input);
      }
    }
    if (json === undefined && text) {
      json = tryParse(text);
    }
    return { text, json };
  }

  const { default: OpenAI } = await import("openai");
  const isGoogle = opts.provider === "google";
  const isOpenRouter = opts.provider === "openrouter";
  const client = new OpenAI({
    apiKey,
    ...(isGoogle
      ? { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" }
      : isOpenRouter
      ? {
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://joey.evonera.com",
            "X-Title": "Joey",
          },
        }
      : {}),
  });
  const completionFormat = opts.jsonSchema
    ? {
        type: "json_schema" as const,
        json_schema: {
          name: "flow_node_result",
          schema: opts.jsonSchema,
        },
      }
    : undefined;

  let effectiveModel = opts.model;
  if (opts.provider === "google" && (!effectiveModel || !effectiveModel.startsWith("gemini-"))) {
    effectiveModel = "gemini-2.5-flash";
  } else if (opts.provider === "openai" && (!effectiveModel || effectiveModel.startsWith("claude-") || effectiveModel.startsWith("gemini-"))) {
    effectiveModel = "gpt-4o-mini";
  }

  const response = await client.chat.completions.create(
    {
      model: effectiveModel,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 2048,
      ...(completionFormat ? { response_format: completionFormat } : {}),
    },
    { signal: opts.signal },
  );
  try {
    await recordUsage(
      opts.tenantId,
      response.usage?.prompt_tokens ?? 0,
      response.usage?.completion_tokens ?? 0,
    );
  } catch {
    // ignore
  }
  const choice = response.choices[0];
  if (choice?.message?.refusal) {
    const providerName = isGoogle ? "Google Gemini" : isOpenRouter ? "OpenRouter" : "OpenAI";
    throw new Error(`${providerName} refused request: ${choice.message.refusal}`);
  }
  if (choice?.finish_reason === "content_filter") {
    throw new Error("AI generation stopped by content filter.");
  }
  if (choice?.finish_reason === "length") {
    throw new Error("AI generation stopped due to max tokens length limit.");
  }
  const text = choice?.message?.content ?? "";
  return { text, json: tryParse(text) };
}

async function recordUsage(tenantId: string, inputTokens: number, outputTokens: number) {
  if (!inputTokens && !outputTokens) return;
  const { recordTokenUsage } = await import("@/lib/usage");
  await recordTokenUsage(tenantId, inputTokens, outputTokens);
}

function tryParse(text: string): unknown | undefined {
  const trimmed = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}
