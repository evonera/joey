import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createJoeyMcpServer } from "@/lib/mcp/joey-tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Remote MCP endpoint for external desktop agents (Claude Desktop, Codex).
 * Companion to the in-page WebMCP tools (document.modelContext): WebMCP
 * requires an open authenticated page, while this endpoint uses `joe_*`
 * Bearer tokens so headless agents can drive Joey without a browser.
 *
 * Configure in Claude Desktop (`claude_desktop_config.json`):
 *   { "mcpServers": { "joey": { "url": "https://<host>/api/mcp",
 *     "headers": { "Authorization": "Bearer joe_..." } } } }
 * Or Codex (`config.toml`): [mcp_servers.joey] url + bearer token.
 *
 * Stateless transport: each POST gets a fresh server + transport pair.
 * Approve/publish/send stay scoped: creation tools stage work, humans
 * approve in the Joey UI (mirrors the WebMCP trust boundary).
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Origin, mcp-session-id",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  let auth;
  try {
    auth = await authenticateApiRequest(request);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.startsWith("Insufficient scope") ? 403 : 401;
    return NextResponse.json({ error: message }, { status, headers: corsHeaders });
  }

  const server = createJoeyMcpServer({
    tenantId: auth.tenantId,
    scopes: auth.scopes,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: no session persistence
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "MCP request failed";
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message },
        id: null,
      },
      { status: 500, headers: corsHeaders },
    );
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export async function GET() {
  return NextResponse.json(
    {
      name: "joey",
      description:
        "Joey remote MCP server. Connect with an MCP client (Claude Desktop, Codex) using a joey joe_* Bearer token. See docs/webmcp.md for setup.",
      endpoint: "/api/mcp",
      transports: ["streamable-http"],
    },
    { status: 200, headers: corsHeaders },
  );
}

export async function DELETE() {
  // Stateless mode: no sessions to tear down.
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
