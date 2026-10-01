import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createJoeyMcpServer } from "@/lib/mcp/joey-tools";
import { readBoundedJson } from "@/lib/http/read-bounded-json";

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
function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get("origin");
  const configuredOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    ...(process.env.JOEY_CORS_ALLOWED_ORIGINS || "").split(","),
  ].filter((value): value is string => Boolean(value?.trim())).flatMap((value) => {
    try { return [new URL(value.trim()).origin]; } catch { return []; }
  });
  const allowed = !origin || configuredOrigins.includes(origin);
  const allowOrigin = origin ? (allowed ? origin : "null") : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Origin, mcp-session-id",
    "Vary": "Origin",
  };
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    ...(process.env.JOEY_CORS_ALLOWED_ORIGINS || "").split(","),
  ].filter((value): value is string => Boolean(value?.trim())).flatMap((value) => {
    try { return [new URL(value.trim()).origin]; } catch { return []; }
  });
  return allowed.includes(origin);
}

export async function OPTIONS(request: Request) {
  const headers = getCorsHeaders(request);
  return new NextResponse(null, {
    status: originAllowed(request) ? 204 : 403,
    headers,
  });
}

export async function POST(request: Request) {
  const headers = getCorsHeaders(request);
  if (!originAllowed(request)) return NextResponse.json({ error: "Origin is not allowed" }, { status: 403, headers });
  let auth;
  try {
    auth = await authenticateApiRequest(request);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.startsWith("Insufficient scope") ? 403 : 401;
    return NextResponse.json({ error: message }, { status, headers });
  }

  let transportRequest = request;
  if (request.method === "POST") {
    const parsed = await readBoundedJson<unknown>(request, 1024 * 1024);
    if (!parsed.ok) {
      return NextResponse.json({
        jsonrpc: "2.0",
        error: { code: parsed.reason === "too_large" ? -32600 : -32700, message: parsed.reason === "too_large" ? "Request body is too large" : "Invalid JSON body" },
        id: null,
      }, { status: parsed.reason === "too_large" ? 413 : 400, headers });
    }
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("content-length");
    requestHeaders.set("content-type", "application/json");
    transportRequest = new Request(request.url, {
      method: request.method,
      headers: requestHeaders,
      body: JSON.stringify(parsed.value),
      signal: request.signal,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
  }

  const server = createJoeyMcpServer({
    tenantId: auth.tenantId,
    scopes: auth.scopes,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: no session persistence
  });

  let cleanupPromise: Promise<void> | undefined;
  let cancelOnAbort: (() => void) | undefined;
  const cleanup = () => {
    cleanupPromise ??= Promise.all([
      transport.close().catch(() => undefined),
      server.close().catch(() => undefined),
    ]).then(() => {
      if (cancelOnAbort) request.signal.removeEventListener("abort", cancelOnAbort);
    });
    return cleanupPromise;
  };

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(transportRequest);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    if (!response.body) {
      await cleanup();
      return response;
    }

    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            controller.close();
            reader.releaseLock();
            await cleanup();
          } else {
            controller.enqueue(chunk.value);
          }
        } catch (error) {
          controller.error(error);
          await reader.cancel(error).catch(() => undefined);
          await cleanup();
        }
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => undefined);
        await cleanup();
      },
    });

    const onRequestAbort = () => {
      void reader.cancel(request.signal.reason).catch(() => undefined).finally(cleanup);
    };
    cancelOnAbort = onRequestAbort;
    if (request.signal.aborted) onRequestAbort();
    else request.signal.addEventListener("abort", onRequestAbort, { once: true });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error: unknown) {
    await cleanup();
    const message = error instanceof Error ? error.message : "MCP request failed";
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message },
        id: null,
      },
      { status: 500, headers },
    );
  }
}

export async function GET(request: Request) {
  const headers = getCorsHeaders(request);
  if (!originAllowed(request)) return NextResponse.json({ error: "Origin is not allowed" }, { status: 403, headers });
  return NextResponse.json(
    {
      name: "joey",
      description:
        "Joey remote MCP server. Connect with an MCP client (Claude Desktop, Codex) using a joey joe_* Bearer token. See docs/webmcp.md for setup.",
      endpoint: "/api/mcp",
      transports: ["streamable-http"],
    },
    { status: 200, headers },
  );
}

export async function DELETE(request: Request) {
  const headers = getCorsHeaders(request);
  if (!originAllowed(request)) return NextResponse.json({ error: "Origin is not allowed" }, { status: 403, headers });
  try {
    await authenticateApiRequest(request);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.startsWith("Insufficient scope") ? 403 : 401;
    return NextResponse.json({ error: message }, { status, headers });
  }
}
