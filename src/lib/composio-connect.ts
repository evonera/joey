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

function apiKey(): string {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY is not set");
  return key;
}

async function mcpFetch(tenantId: string, body: object, sessionId?: string): Promise<Response> {
  return fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-consumer-api-key": apiKey(),
      "x-composio-entity-id": tenantId,
      "x-composio-user-id": tenantId,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function parseMcpBody(response: Response): Promise<McpToolResponse> {
  const text = await response.text();
  if (text.startsWith("{")) return JSON.parse(text) as McpToolResponse;
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) return JSON.parse(line.slice(6)) as McpToolResponse;
  }
  throw new Error(`Unparseable MCP response (${response.status})`);
}

export async function manageConnections(
  tenantId: string,
  toolkits: { name: string; action: "list" | "add" | "remove"; account_id?: string }[],
): Promise<Record<string, unknown>> {
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
  if (!init.ok || sessionId === null) {
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
  const message = await parseMcpBody(call);
  if (message.error) throw new Error(message.error.message ?? "MCP call failed");
  const text = message.result?.content?.find((entry) => entry.type === "text")?.text;
  if (text === undefined) throw new Error("Empty MCP tool response");
  const parsed = JSON.parse(text) as {
    data?: Record<string, unknown>;
    error?: string | null;
    successful?: boolean;
  };
  if (parsed.error) throw new Error(parsed.error);
  return parsed.data ?? {};
}
