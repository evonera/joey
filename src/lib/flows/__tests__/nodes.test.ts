import { describe, it, expect } from "vitest";
import { parseFeed } from "@/lib/flows/nodes/data/rss";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Hello &amp; Welcome</title>
    <link>https://blog.example.com/hello</link>
    <guid>post-1</guid>
    <pubDate>Tue, 10 Aug 2026 09:00:00 GMT</pubDate>
    <description><![CDATA[<p>First post body</p>]]></description>
  </item>
  <item>
    <title>Second</title>
    <link>https://blog.example.com/second</link>
    <guid>post-2</guid>
    <description>Plain text summary</description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:example.com,2026:1</id>
    <title>Atom entry</title>
    <link href="https://example.com/atom-1" rel="alternate"/>
    <updated>2026-08-11T00:00:00Z</updated>
    <summary>Summary text</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("parses RSS items with CDATA and entity decoding", () => {
    const items = parseFeed(RSS, 10);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Hello & Welcome",
      link: "https://blog.example.com/hello",
      guid: "post-1",
      summary: "First post body", // tags stripped by design
    });
  });

  it("respects the limit", () => {
    expect(parseFeed(RSS, 1)).toHaveLength(1);
  });

  it("parses Atom entries with href-style links", () => {
    const items = parseFeed(ATOM, 10);
    expect(items[0]).toMatchObject({
      title: "Atom entry",
      link: "https://example.com/atom-1",
      guid: "tag:example.com,2026:1",
    });
  });

  it("returns empty array for non-feed input", () => {
    expect(parseFeed("<html><body>hi</body></html>", 10)).toEqual([]);
  });
});

import { executeFlow } from "@/lib/flows/executor";

describe("logic.split (A/B)", () => {
  const graph = {
    nodes: [
      { id: "t", type: "trigger.manual", config: { samplePayload: '"data"' }, position: { x: 0, y: 0 } },
      { id: "sp", type: "logic.split", config: { aWeightPercent: 100 }, position: { x: 0, y: 0 } },
      { id: "a", type: "transform.dedupe", config: { field: "x" }, position: { x: 0, y: 0 } },
      { id: "b", type: "transform.filter", config: { field: "x", operator: "exists" as const }, position: { x: 0, y: 0 } },
    ],
    edges: [
      { from: "t", to: "sp" },
      { from: "sp", to: "a", branch: "a" },
      { from: "sp", to: "b", branch: "b" },
    ],
  };

  it("routes down 'a' when weight is 100", async () => {
    const res = await executeFlow(graph as never, { tenantId: "t", runId: "r", flowId: "f" });
    const byId = Object.fromEntries(res.steps.map((s) => [s.nodeId, s.status]));
    expect(byId["a"]).toBe("succeeded");
    expect(byId["b"]).toBe("skipped");
  });
});
