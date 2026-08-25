


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
      return decrypt(tenantKey.encryptedKey);
    }
  }
  const envKey =
    provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
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
  provider: "openai" | "anthropic";
  model: string;
  messages: LlmMessage[];
  /** Optional JSON schema (as plain object) to force structured output. */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
}): Promise<LlmResult> {
  const apiKey = await resolveKey(opts.tenantId, opts.provider);

  if (opts.provider === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const system = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = opts.messages.filter((m) => m.role !== "system");
    const response = await client.messages.create({
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
    });
    try {
      await recordUsage(opts.tenantId, response.usage.input_tokens, response.usage.output_tokens);
    } catch {
      // budget recording must never fail a flow node
    }
    // Reject incomplete generations: token-limit truncation, refusals, and
    // stop-sequence hits must never flow downstream as "successful" output.
    const completeStops = new Set(["end_turn", "tool_use", "pause_turn"]);
    if (!response.stop_reason || !completeStops.has(response.stop_reason)) {
      throw new Error(
        `Anthropic stopped with reason "${response.stop_reason ?? "none"}" — treating it as a failed generation.`,
      );
    }

    const block = response.content[0];
    let text = "";
    let json: unknown;
    if (block && block.type === "tool_use") {
      json = block.input;
      text = JSON.stringify(block.input);
    } else if (block && block.type === "text") {
      text = block.text;
      json = tryParse(text);
    }
    return { text, json };
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const completionFormat = opts.jsonSchema
    ? {
        type: "json_schema" as const,
        json_schema: {
          name: "flow_node_result",
          schema: opts.jsonSchema,
        },
      }
    : undefined;

  const response = await client.chat.completions.create({
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 2048,
    ...(completionFormat ? { response_format: completionFormat } : {}),
  });
  try {
    await recordUsage(
      opts.tenantId,
      response.usage?.prompt_tokens ?? 0,
      response.usage?.completion_tokens ?? 0,
    );
  } catch {
    // ignore
  }
  const text = response.choices[0]?.message?.content ?? "";
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
