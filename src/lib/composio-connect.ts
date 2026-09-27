const MCP_URL = "https://connect.composio.dev/mcp";

export const CANDIDATE_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "googledocs",
  "googlesheets",
  "notion",
  "slack",
  "github",
  "linear",
  "discord",
  "reddit",
  "twitter",
  "youtube",
  "dropbox",
  "trello",
  "asana",
  "jira",
  "hubspot",
  "airtable",
  "telegram",
] as const;

interface McpToolResponse {
  result?: {
    content?: { type: string; text?: string }[];
    isError?: boolean;
  };
  error?: { message?: string };
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TOOLKIT_NAME = /^[a-z0-9_-]{1,64}$/;

function apiKey(): string {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY is not set");
  return key;
}

async function mcpFetch(tenantId: string, body: object, sessionId?: string): Promise<Response> {
  const key = apiKey();
  try {
    return await fetch(MCP_URL, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-consumer-api-key": key,
        "x-composio-entity-id": tenantId,
        "x-composio-user-id": tenantId,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("Composio Connect request failed", error instanceof Error ? error.name : "unknown");
    throw new Error(error instanceof Error && error.name === "TimeoutError"
      ? "Composio Connect request timed out"
      : "Composio Connect request failed");
  }
}

async function boundedResponseText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Composio Connect response exceeded the size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function parseMcpBody(response: Response): Promise<McpToolResponse> {
  const text = await boundedResponseText(response);
  if (text.trimStart().startsWith("{")) return JSON.parse(text) as McpToolResponse;
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      try {
        const parsed = JSON.parse(line.slice(6)) as McpToolResponse;
        if (parsed.result || parsed.error) return parsed;
      } catch {
        // SSE streams may contain keepalives or non-JSON event data.
      }
    }
  }
  throw new Error(`Unparseable MCP response (${response.status})`);
}

export async function manageConnections(
  tenantId: string,
  toolkits: { name: string; action: "list" | "add" | "remove"; account_id?: string }[],
): Promise<Record<string, unknown>> {
  if (!tenantId || tenantId.length > 128) throw new Error("Invalid workspace identity");
  if (!Array.isArray(toolkits) || toolkits.length < 1 || toolkits.length > 50) throw new Error("Choose between 1 and 50 toolkits");
  const seen = new Set<string>();
  for (const toolkit of toolkits) {
    if (!toolkit || !TOOLKIT_NAME.test(toolkit.name) || !CANDIDATE_TOOLKITS.includes(toolkit.name as typeof CANDIDATE_TOOLKITS[number])) {
      throw new Error("Unsupported Composio toolkit");
    }
    if (seen.has(toolkit.name)) throw new Error("Duplicate Composio toolkit");
    seen.add(toolkit.name);
    if (!["list", "add", "remove"].includes(toolkit.action)) throw new Error("Unsupported Composio connection action");
    if (toolkit.account_id !== undefined && (typeof toolkit.account_id !== "string" || toolkit.account_id.length > 128)) {
      throw new Error("Invalid Composio account ID");
    }
  }
  const init = await mcpFetch(
    tenantId,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "joey-web", version: "1.0" },
      },
    }
  );
  const sessionId = init.headers.get("mcp-session-id");
  const initMessage = init.ok ? await parseMcpBody(init) : null;
  if (!init.ok || initMessage?.error || sessionId === null) {
    throw new Error(`Composio Connect initialize failed (${init.status})`);
  }

  const call = await mcpFetch(
    tenantId,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "COMPOSIO_MANAGE_CONNECTIONS", arguments: { toolkits } },
    },
    sessionId,
  );
  if (!call.ok) throw new Error(`Composio Connect call failed (${call.status})`);
  const message = await parseMcpBody(call);
  if (message.error) throw new Error(message.error.message ?? "MCP call failed");
  if (message.result?.isError) throw new Error("Composio connection management failed");
  const text = message.result?.content?.find((entry) => entry.type === "text")?.text;
  if (text === undefined) throw new Error("Empty MCP tool response");
  const parsed = JSON.parse(text) as {
    data?: Record<string, unknown>;
    error?: string | null;
    successful?: boolean;
  };
  if (parsed.error) throw new Error(parsed.error);
  if (parsed.successful === false) throw new Error("Composio connection management failed");
  return parsed.data ?? {};
}
