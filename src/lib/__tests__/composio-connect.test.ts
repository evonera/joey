import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { manageConnections } from "@/lib/composio-connect";

describe("Composio Connect client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubEnv("COMPOSIO_API_KEY", "test-composio-key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("bounds toolkit requests before making a network call", async () => {
    await expect(manageConnections("tenant-1", Array.from({ length: 51 }, (_, i) => ({ name: `tool${i}`, action: "list" as const }))))
      .rejects.toThrow("Choose between 1 and 50 toolkits");
    await expect(manageConnections("tenant-1", [{ name: "not-a-toolkit", action: "add" }]))
      .rejects.toThrow("Unsupported Composio toolkit");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses bounded JSON/SSE responses and preserves tenant identity", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"result":{"capabilities":{}}}', {
        headers: { "mcp-session-id": "session-1", "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(`data: ${JSON.stringify({
        result: { content: [{ type: "text", text: JSON.stringify({ successful: true, data: { connected: true } }) }] },
      })}\n\n`, { headers: { "content-type": "text/event-stream" } }));

    await expect(manageConnections("tenant-1", [{ name: "github", action: "list" }]))
      .resolves.toEqual({ connected: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      "x-composio-entity-id": "tenant-1",
      "x-composio-user-id": "tenant-1",
    });
  });

  it("maps upstream timeouts to a stable error", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("network timeout"), { name: "TimeoutError" }));
    await expect(manageConnections("tenant-1", [{ name: "github", action: "list" }]))
      .rejects.toThrow("Composio Connect request timed out");
  });
});
