import { describe, expect, it, vi, beforeEach } from "vitest";
import { synthesizeScoutResearch, validateScoutEditorial } from "../remix-research";
import { scoutRemixEventKey } from "../remix-receipts";
import type { ScoutAlert } from "../evaluator";
import type { ExaSearchResultItem } from "@/lib/search/exa-client";
const mockLlm = vi.hoisted(() => vi.fn());
vi.mock("@/lib/llm", () => ({ runLlm: mockLlm }));
vi.mock("@/lib/db", () => ({ db: {} }));
const quote = "The new satellite launched on Monday with three instruments.";
const sources = ["https://news.example.org/story", "https://science.example.net/story"].map((url, i) => ({
  id: String(i),
  title: "A satellite launch",
  url,
  highlights: [quote],
  imageLinks: [],
})) satisfies ExaSearchResultItem[];
const copy = () => ({
  title: "What this launch means for researchers",
  caption: "A new satellite carries three instruments.",
  hashtags: ["space"],
  facts: [
    {
      claim: "The satellite launched on Monday.",
      verdict: "supported",
      evidence: sources.map((source) => ({ sourceUrl: source.url, quote })),
    },
  ],
});

describe("Scout evidence and editorial synthesis", () => {
  beforeEach(() => vi.resetAllMocks());
  it("requires matching quoted excerpts from independent publishers to corroborate", () => {
    const result = validateScoutEditorial(copy(), sources);
    expect(result.facts[0].corroborationStatus).toBe("corroborated");
    expect(result.requiresFactReview).toBe(false);
    expect(result.hashtags).toEqual(["#space"]);
    expect(result.facts[0].corroborationStatus).not.toBe("verified");
  });
  it("does not count two pages/subdomains of the same publisher as independent", () => {
    const siblings = [sources[0], { ...sources[1], url: "https://blog.news.example.org/second" }];
    const value = copy();
    value.facts[0].evidence[1].sourceUrl = siblings[1].url;
    expect(validateScoutEditorial(value, siblings).requiresFactReview).toBe(true);
  });
  it("does not count invented quotes or unprovided source URLs", () => {
    const value = copy();
    value.facts[0].evidence[1].quote = "Fabricated evidence is not allowed here.";
    expect(validateScoutEditorial(value, sources).requiresFactReview).toBe(true);
    value.facts[0].evidence[0].sourceUrl = "https://unprovided.example.com/story";
    expect(() => validateScoutEditorial(value, sources)).toThrow("no supported source excerpts");
  });
  it("blocks conflicting facts and malformed editorial output", () => {
    expect(() =>
      validateScoutEditorial({ ...copy(), facts: [{ ...copy().facts[0], verdict: "contradicted" }] }, sources)
    ).toThrow("conflicting claims");
    expect(() => validateScoutEditorial({ ...copy(), title: "" }, sources)).toThrow();
  });
  it("uses one budget-metered call for source comparison and original brand voice", async () => {
    mockLlm.mockResolvedValue({ json: copy() });
    await synthesizeScoutResearch({
      tenantId: "tenant-1",
      page: { name: "Science Daily", niche: "Space", audience: "Researchers", voice: "Precise" },
      sources,
      signal: new AbortController().signal,
    });
    expect(mockLlm).toHaveBeenCalledOnce();
    expect(mockLlm.mock.calls[0][0]).toMatchObject({ tenantId: "tenant-1", maxTokens: 1800 });
    expect(mockLlm.mock.calls[0][0].messages[1].content).toContain("Precise");
  });
  it("does not spend tokens to verify bare headlines", async () => {
    await expect(
      synthesizeScoutResearch({
        tenantId: "tenant-1",
        page: { name: "Test", niche: null, audience: null, voice: null },
        sources: [{ ...sources[0], highlights: [] }],
        signal: new AbortController().signal,
      })
    ).rejects.toThrow("headlines alone");
    expect(mockLlm).not.toHaveBeenCalled();
  });
});

describe("source event identity", () => {
  const alert = {
    title: "Launch",
    samplePost: { url: "https://instagram.com/p/launch/?utm_source=a", likes: 10 },
    changes: [],
    detectedAt: "2026-10-01",
  } as unknown as ScoutAlert;
  it("ignores timestamps, tracking parameters and increasing engagement counts", () => {
    expect(scoutRemixEventKey("https://instagram.com/science", "new launch", alert)).toBe(
      scoutRemixEventKey("https://instagram.com/science", "new launch", {
        ...alert,
        detectedAt: "later",
        samplePost: { ...alert.samplePost!, url: "https://instagram.com/p/launch", likes: 50 },
      })
    );
  });
  it("separates source posts and changed monitoring goals", () => {
    const key = scoutRemixEventKey("target", "goal", alert);
    expect(scoutRemixEventKey("target", "other goal", alert)).not.toBe(key);
    expect(
      scoutRemixEventKey("target", "goal", {
        ...alert,
        samplePost: { ...alert.samplePost!, url: "https://instagram.com/p/another" },
      })
    ).not.toBe(key);
  });
});
