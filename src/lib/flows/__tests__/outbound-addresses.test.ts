// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { outboundRequest, isPrivateAddress } from "../outbound-request";

describe("public source IPv4 ranges", () => {
  it("permits NASA's public WordPress address without treating all of 192.0/16 as reserved", () => {
    expect(isPrivateAddress("192.0.66.108")).toBe(false);
    expect(isPrivateAddress("::ffff:c000:426c")).toBe(false);
  });
  it.each(["192.0.0.1", "192.0.2.1", "192.168.0.1", "127.0.0.1", "169.254.169.254", "10.0.0.1", "172.16.0.1", "100.64.0.1", "198.51.100.1", "203.0.113.1"])("still blocks restricted destination %s", address => {
    expect(isPrivateAddress(address)).toBe(true);
  });
});


it("opens a real pinned connection under Node 24", async () => {
  const server = createServer((_request, response) => { response.end("pinned response"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test listener");
    const response = await outboundRequest(`http://127.0.0.1:${address.port}/fixture`, { allowPrivateHosts: true, timeoutMs: 3000 });
    expect(response.status).toBe(200);
    expect(response.buffer.toString()).toBe("pinned response");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
