import { describe, it, expect } from "vitest";
import { 
  normalizeCanonicalUrl, 
  hashCanonicalUrl, 
  normalizeContentBody, 
  hashContentBody 
} from "@/lib/theme-studio/pipeline/deduplicator";
import { parseRssXml } from "@/lib/theme-studio/pipeline/source-poller";
import { verifyRightsAndProvenance } from "@/lib/theme-studio/pipeline/fact-rights-verifier";
import { calculateTopicOverlap } from "@/lib/theme-studio/pipeline/story-clusterer";

describe("Theme Studio Editorial Pipeline", () => {
  describe("Pre-LLM Deduplication", () => {
    it("strips UTM parameters and tracking queries to produce identical canonical URL hashes", () => {
      const url1 = "https://www.espn.com/nba/story/_/id/12345?utm_source=twitter&utm_medium=social";
      const url2 = "https://www.espn.com/nba/story/_/id/12345?ref=homepage&fbclid=abcdef123";
      const url3 = "https://www.espn.com/nba/story/_/id/12345/";

      const hash1 = hashCanonicalUrl(url1);
      const hash2 = hashCanonicalUrl(url2);
      const hash3 = hashCanonicalUrl(url3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("preserves case on path and query parameters to avoid colliding distinct resources", () => {
      const urlA = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const urlB = "https://www.youtube.com/watch?v=dqw4w9wgxcq";

      const normA = normalizeCanonicalUrl(urlA);
      const normB = normalizeCanonicalUrl(urlB);

      expect(normA).not.toBe(normB);
      expect(normA).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    });

    it("normalizes text bodies with different formatting and whitespace into identical content hashes", () => {
      const body1 = "<p>LeBron James scored <strong>30 points</strong> in a dominant win over the Nuggets.</p>";
      const body2 = "lebron james scored 30 points in a dominant win over the nuggets.\n\n";

      const hash1 = hashContentBody(body1);
      const hash2 = hashContentBody(body2);

      expect(hash1).toBe(hash2);
    });

    it("generates distinct canonical URL hashes for HTTP items using query parameters", () => {
      const sourceUrl = "https://api.example.com/v1/news";
      const itemUrl1 = `${sourceUrl}?item_id=article-101`;
      const itemUrl2 = `${sourceUrl}?item_id=article-102`;

      const norm1 = normalizeCanonicalUrl(itemUrl1);
      const norm2 = normalizeCanonicalUrl(itemUrl2);
      expect(norm1).not.toBe(norm2);

      const hash1 = hashCanonicalUrl(itemUrl1);
      const hash2 = hashCanonicalUrl(itemUrl2);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("RSS Parser", () => {
    it("extracts structured items from RSS XML", () => {
      const sampleXml = `
        <rss version="2.0">
          <channel>
            <title>NBA News</title>
            <item>
              <title><![CDATA[Lakers Secure Crucial Win]]></title>
              <link>https://example.com/nba/1</link>
              <description><![CDATA[<p>Full game recap and stats breakdown.</p>]]></description>
              <pubDate>Mon, 01 Sep 2026 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>
      `;

      const items = parseRssXml(sampleXml, "cc_by");
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Lakers Secure Crucial Win");
      expect(items[0].url).toBe("https://example.com/nba/1");
      expect(items[0].body).toBe("Full game recap and stats breakdown.");
      expect(items[0].rightsCategory).toBe("cc_by");
    });
  });

  describe("Fact & Rights Verifier", () => {
    it("enforces strict rights policy and identifies required attributions", () => {
      const validCheck = verifyRightsAndProvenance({
        rightsCategory: "cc_by",
        policy: "strict",
        hasSourceUrl: true,
        hasTimestamp: true,
      });

      expect(validCheck.isCompliant).toBe(true);
      expect(validCheck.attributionRequired).toBe(true);
      expect(validCheck.violations).toHaveLength(0);

      const invalidCheck = verifyRightsAndProvenance({
        rightsCategory: "unknown",
        policy: "strict",
        hasSourceUrl: true,
        hasTimestamp: true,
      });

      expect(invalidCheck.isCompliant).toBe(false);
      expect(invalidCheck.violations).toContain('Rights category "unknown" is blocked under strict policy.');
    });

    it("rejects items with missing source provenance URL", () => {
      const missingUrlCheck = verifyRightsAndProvenance({
        rightsCategory: "owned",
        policy: "strict",
        hasSourceUrl: false,
        hasTimestamp: true,
      });

      expect(missingUrlCheck.isCompliant).toBe(false);
      expect(missingUrlCheck.provenancePassed).toBe(false);
    });
  });

  describe("Story Clustering", () => {
    it("computes term overlap similarity between related articles", () => {
      const textA = "Nikola Jokic posts triple-double as Denver Nuggets defeat Golden State Warriors in thriller";
      const textB = "Denver Nuggets secure thriller victory behind Nikola Jokic triple-double performance";
      const textC = "Tesla announces next-generation humanoid robot mass production schedule";

      const overlapAB = calculateTopicOverlap(textA, textB);
      const overlapAC = calculateTopicOverlap(textA, textC);

      expect(overlapAB).toBeGreaterThanOrEqual(0.3);
      expect(overlapAC).toBe(0);
    });
  });
});
