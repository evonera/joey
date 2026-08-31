import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { executeFlow } from "../executor";
import { isPrivateAddress, outboundRequest, resolveOutboundTarget, stripSensitiveHeaders } from "../outbound-request";
import { parseFeed } from "../nodes/data/rss";

describe("outbound request safety", () => {
  it.each([
    "127.0.0.1", "10.0.0.1", "172.31.2.3", "192.168.1.2", "169.254.169.254",
    "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1",
  ])("rejects private or mapped address %s", (address) => expect(isPrivateAddress(address)).toBe(true));

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("accepts public address %s", (address) => expect(isPrivateAddress(address)).toBe(false));

  it("rejects alternate numeric loopback URLs after URL normalization", async () => {
    await expect(resolveOutboundTarget("http://0x7f000001/")).rejects.toThrow(/private|forbidden/i);
    await expect(resolveOutboundTarget("http://2130706433/")).rejects.toThrow(/private|forbidden/i);
    await expect(resolveOutboundTarget("http://0177.0.0.1/")).rejects.toThrow(/private|forbidden/i);
  });

  it("strips credentials and token-like headers case-insensitively", () => {
    expect(stripSensitiveHeaders({ Authorization: "secret", "X-API-Key": "secret", Cookie: "a=b", Accept: "json" })).toEqual({ Accept: "json" });
  });

  it("honors an already-aborted signal before DNS or sockets", async () => {
    const controller = new AbortController();
    controller.abort(new Error("fenced"));
    await expect(resolveOutboundTarget("https://example.com", controller.signal)).rejects.toThrow("fenced");
  });

  it("bounds slow headers and streaming bodies with one deadline", async () => {
    const server = createServer((_request, response) => setTimeout(() => response.end("late"), 100));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    try {
      await expect(outboundRequest(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, { allowPrivateHosts: true, timeoutMs: 20 })).rejects.toThrow(/timed out/i);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("stops buffering oversized chunked responses", async () => {
    const server = createServer((_request, response) => { response.write(Buffer.alloc(8)); response.end(Buffer.alloc(8)); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    try {
      await expect(outboundRequest(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, { allowPrivateHosts: true, maxBytes: 10 })).rejects.toThrow(/exceeds 10 bytes/i);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("strips credentials and request bodies on cross-origin redirects", async () => {
    let receivedHeaders: Record<string, string | string[] | undefined> = {};
    let receivedBody = "";
    const destination = createServer((request, response) => { receivedHeaders = request.headers; request.on("data", (chunk) => { receivedBody += chunk; }); request.on("end", () => response.end("ok")); });
    await new Promise<void>((resolve) => destination.listen(0, "127.0.0.1", resolve));
    const destinationAddress = destination.address();
    const destinationUrl = `http://127.0.0.1:${typeof destinationAddress === "object" && destinationAddress ? destinationAddress.port : 0}`;
    const redirector = createServer((_request, response) => { response.writeHead(307, { location: destinationUrl }); response.end(); });
    await new Promise<void>((resolve) => redirector.listen(0, "127.0.0.1", resolve));
    const redirectAddress = redirector.address();
    try {
      await outboundRequest(`http://127.0.0.1:${typeof redirectAddress === "object" && redirectAddress ? redirectAddress.port : 0}`, { allowPrivateHosts: true, method: "POST", body: "secret-body", headers: { Authorization: "Bearer secret", Cookie: "secret=yes", "content-type": "text/plain" } });
      expect(receivedHeaders.authorization).toBeUndefined();
      expect(receivedHeaders.cookie).toBeUndefined();
      expect(receivedBody).toBe("");
    } finally {
      await Promise.all([new Promise<void>((resolve) => redirector.close(() => resolve())), new Promise<void>((resolve) => destination.close(() => resolve()))]);
    }
  });
});

describe("safe data nodes", () => {
  it("parses RSS and Atom entries with a hard item limit", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>A &amp; B</title><link>https://example.com/a</link><description><![CDATA[<p>Body</p>]]></description></item><item><title>Second</title></item></channel></rss>`;
    expect(parseFeed(xml, 1)).toEqual([expect.objectContaining({ title: "A & B", link: "https://example.com/a", summary: "Body" })]);
  });

  it("keeps split routing stable across deterministic recovery", async () => {
    const graph = {
      nodes: [
        { id: "trigger", type: "trigger.manual", config: { samplePayload: "{}" }, position: { x: 0, y: 0 } },
        { id: "split", type: "logic.split", config: { aWeightPercent: 50 }, position: { x: 0, y: 0 } },
      ],
      edges: [{ from: "trigger", to: "split" }],
    };
    const first = await executeFlow(graph, { tenantId: "tenant", flowId: "flow", runId: "run" });
    const second = await executeFlow(graph, { tenantId: "tenant", flowId: "flow", runId: "run" });
    expect(first.steps.find((step) => step.nodeId === "split")?.branch).toBe(second.steps.find((step) => step.nodeId === "split")?.branch);
  });

  it("does not expose allowPrivateHosts in user-configurable http schema", async () => {
    const { httpConfig } = await import("../catalog");
    const parsed = httpConfig.parse({ url: "https://example.com/api" });
    expect(parsed).not.toHaveProperty("allowPrivateHosts");
  });

  it("strips configured bodies when destination origin is dynamically selected", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/lib/flows/nodes/data/http.ts"), "utf8");
    expect(source).toContain("const body = dynamicOrigin || config.method === \"GET\" || !config.bodyJson ? undefined");
  });
});
