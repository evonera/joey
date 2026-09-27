import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleRequest: vi.fn<() => Promise<Response>>(),
  transportClose: vi.fn<() => Promise<void>>(),
  serverClose: vi.fn<() => Promise<void>>(),
  connect: vi.fn<() => Promise<void>>(),
  authenticate: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({
  WebStandardStreamableHTTPServerTransport: class {
    handleRequest = mocks.handleRequest;
    close = mocks.transportClose;
  },
}));
vi.mock("@/lib/api-auth", () => ({ authenticateApiRequest: mocks.authenticate }));
vi.mock("@/lib/mcp/joey-tools", () => ({
  createJoeyMcpServer: () => ({ connect: mocks.connect, close: mocks.serverClose }),
}));

import { POST } from "./route";

describe("POST /api/mcp streaming lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ tenantId: "tenant-1", scopes: ["read"] });
    mocks.connect.mockResolvedValue(undefined);
    mocks.transportClose.mockResolvedValue(undefined);
    mocks.serverClose.mockResolvedValue(undefined);
  });

  it("keeps the transport open until all response chunks are consumed", async () => {
    let enqueue!: (chunk: Uint8Array) => void;
    let finish!: () => void;
    mocks.handleRequest.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        enqueue = (chunk) => controller.enqueue(chunk);
        finish = () => controller.close();
      },
    }), { headers: { "content-type": "text/event-stream" } }));

    const response = await POST(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","method":"initialize","id":1}',
    }));
    expect(mocks.transportClose).not.toHaveBeenCalled();

    enqueue(new TextEncoder().encode("event: first\n"));
    enqueue(new TextEncoder().encode("event: second\n"));
    finish();

    await expect(response.text()).resolves.toBe("event: first\nevent: second\n");
    expect(mocks.transportClose).toHaveBeenCalledOnce();
    expect(mocks.serverClose).toHaveBeenCalledOnce();
  });

  it("closes the transport when the response consumer cancels", async () => {
    mocks.handleRequest.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("event: pending\n")); },
    }), { headers: { "content-type": "text/event-stream" } }));

    const response = await POST(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","method":"initialize","id":1}',
    }));
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel("client disconnected");

    expect(mocks.transportClose).toHaveBeenCalledOnce();
    expect(mocks.serverClose).toHaveBeenCalledOnce();
  });

  it("rejects an oversized request body before creating an MCP transport", async () => {
    const response = await POST(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(1024 * 1024 + 1) },
      body: "{}",
    }));
    expect(response.status).toBe(413);
    expect(mocks.handleRequest).not.toHaveBeenCalled();
  });
});
