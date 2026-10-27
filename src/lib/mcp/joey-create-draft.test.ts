import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const mocks = vi.hoisted(() => ({ values: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { insert: mocks.insert } }));
vi.mock("@/lib/flows/nodes/ai/transcribe", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/flows/nodes/ai/transcribe")>(),
  validateSafeUrl: async (url: string) => {
    if (url.includes("127.0.0.1")) throw new Error("Private destination");
  },
}));

import { createJoeyMcpServer } from "./joey-tools";

describe("MCP draft creation", () => {
  let client: Client;
  let server: ReturnType<typeof createJoeyMcpServer>;
  beforeEach(async () => {
    mocks.values.mockReset().mockReturnValue({ returning: async () => [{ id: "draft-1" }] });
    mocks.insert.mockReset().mockReturnValue({ values: mocks.values });
    server = createJoeyMcpServer({ tenantId: "tenant-1", scopes: ["write"] });
    client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });
  afterEach(async () => { await client.close(); await server.close(); });

  it("creates a media-only draft in the authenticated workspace", async () => {
    const result = await client.callTool({ name: "joey_create_draft", arguments: { content: "", mediaUrls: ["https://example.com/image.png"] } });
    expect(result.isError).not.toBe(true);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", content: "", status: "pending_review" }));
  });

  it.each([
    { content: "  " },
    { content: "", mediaUrls: [] },
    { content: "text", mediaUrls: ["file:///etc/passwd"] },
    { content: "text", mediaUrls: ["https://user:pass@example.com/image.png"] },
    { content: "text", mediaUrls: ["http://127.0.0.1/image.png"] },
    { content: "", mediaUrls: ["https://example.com/image.png", "ftp://example.com/image.png"] },
  ])("rejects an empty or unsafe draft %#", async (args) => {
    const result = await client.callTool({ name: "joey_create_draft", arguments: args });
    expect(result.isError).toBe(true);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
