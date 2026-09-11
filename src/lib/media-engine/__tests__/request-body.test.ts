import { describe, expect, it } from "vitest";
import { readWorkerBody } from "../request-body";
describe("bounded worker requests", () => {
  it("reads valid signed content without changing bytes", async () => {
    expect(await readWorkerBody(new Request("https://example.test", { method: "POST", body: '{"title":"☕"}' }), 100)).toBe('{"title":"☕"}');
  });
  it("rejects oversized content even without Content-Length", async () => {
    expect(await readWorkerBody(new Request("https://example.test", { method: "POST", body: "☕".repeat(10) }), 10)).toBeNull();
  });
  it("rejects excessive declared size before reading", async () => {
    expect(await readWorkerBody(new Request("https://example.test", { method: "POST", body: "a", headers: { "content-length": "1000" } }), 10)).toBeNull();
  });
});
