import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateStoryAffinitySemantically,
  type StoryAffinityResult,
} from "@/lib/typesafe";
import {
  clusterSourceItems,
  calculateTopicOverlap,
} from "../pipeline/story-clusterer";

// DB Mocks
const mockFindFirstPage = vi.fn();
const mockFindManyItems = vi.fn();
const mockInsertValues = vi.fn().mockResolvedValue(undefined);
const mockDbUpdateWhere = vi.fn().mockResolvedValue([]);
const mockDbUpdateSet = vi.fn(() => ({
  where: mockDbUpdateWhere,
}));
const mockDbUpdate = vi.fn(() => ({
  set: mockDbUpdateSet,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      apiKeys: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      themePages: {
        findFirst: (...args: any[]) => mockFindFirstPage(...args),
      },
      sourceItems: {
        findMany: (...args: any[]) => mockFindManyItems(...args),
      },
    },
    update: (...args: any[]) => (mockDbUpdate as any)(...args),
    transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      const mockTx = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockImplementation(async () => {
                return mockFindManyItems();
              }),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          values: (...args: any[]) => mockInsertValues(...args),
        })),
      };
      return cb(mockTx);
    }),
  },
}));

describe("TypeSafe Jev Story Clustering & Fact Gate (Shadow Mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirstPage.mockResolvedValue({
      id: "page-tech-1",
      tenantId: "tenant-1",
      name: "Tech Pulse Daily",
      niche: "Consumer Electronics & AI",
      audience: "Tech enthusiasts and developers",
    });
  });

  describe("evaluateStoryAffinitySemantically", () => {
    it("returns null if story titles are empty or missing", async () => {
      const result = await evaluateStoryAffinitySemantically(
        { title: "" },
        { title: "Valid Title" },
        "tenant-1",
      );
      expect(result).toBeNull();
    });

    it("returns null if no TypeSafe client can be resolved", async () => {
      const result = await evaluateStoryAffinitySemantically(
        { title: "Story A" },
        { title: "Story B" },
        "tenant-no-key",
      );
      expect(result).toBeNull();
    });

    it("evaluates relationship and corroboration via mock TypeSafe client", async () => {
      const mockClient = {
        systemOne: vi.fn().mockResolvedValue({
          answers: {
            relationship: {
              choice: "same_event",
              confidence: 0.94,
              probabilities: { same_event: 0.94, related_topic: 0.05, unrelated: 0.01 },
            },
            corroboration: {
              choice: "corroborates",
              confidence: 0.91,
              probabilities: { corroborates: 0.91, neutral_or_additive: 0.07, contradicts: 0.02 },
            },
          },
        }),
      } as any;

      const result = await evaluateStoryAffinitySemantically(
        { title: "SpaceX Starship Flight 5 catches Super Heavy booster at launchpad", body: "Historic catch by Mechazilla arms." },
        { title: "SpaceX achieves orbital feat catching giant rocket booster", body: "Super Heavy caught in midair." },
        "tenant-1",
        { client: mockClient, force: true },
      );

      expect(result).not.toBeNull();
      expect(result?.relationship).toBe("same_event");
      expect(result?.relationshipConfidence).toBe(0.94);
      expect(result?.corroboration).toBe("corroborates");
      expect(result?.corroborationConfidence).toBe(0.91);
      expect(mockClient.systemOne).toHaveBeenCalledTimes(1);
    });

    it("recovers gracefully and returns null when TypeSafe API call fails or times out", async () => {
      const mockClient = {
        systemOne: vi.fn().mockRejectedValue(new Error("Network timeout after 2500ms")),
      } as any;

      const result = await evaluateStoryAffinitySemantically(
        { title: "Story A" },
        { title: "Story B" },
        "tenant-1",
        { client: mockClient },
      );

      expect(result).toBeNull();
    });
  });

  describe("clusterSourceItems Shadow Mode Evaluation", () => {
    it("reports agreement when Jaccard and Jev both agree stories cover the same event", async () => {
      const rawItems = [
        {
          id: "item-1",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "SpaceX Starship completes fifth test flight with booster tower catch",
          body: "SpaceX successfully launched Starship Flight 5 from Starbase Boca Chica catching the booster.",
          url: "https://space.example.com/flight5",
          publishedAt: new Date(),
          status: "raw",
        },
        {
          id: "item-2",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Starship Flight 5 achieves historic booster catch at Starbase launch tower",
          body: "The Super Heavy booster was caught by mechanical arms at Starbase Boca Chica in flight 5.",
          url: "https://news.example.com/starship-catch",
          publishedAt: new Date(Date.now() - 3600_000),
          status: "raw",
        },
      ];
      mockFindManyItems.mockResolvedValue(rawItems);

      const mockClient = {
        systemOne: vi.fn().mockResolvedValue({
          answers: {
            relationship: {
              choice: "same_event",
              confidence: 0.95,
              probabilities: { same_event: 0.95, related_topic: 0.04, unrelated: 0.01 },
            },
            corroboration: {
              choice: "corroborates",
              confidence: 0.92,
              probabilities: { corroborates: 0.92, neutral_or_additive: 0.06, contradicts: 0.02 },
            },
          },
        }),
      } as any;

      const res = await clusterSourceItems("tenant-1", "page-tech-1", undefined, {
        mode: "shadow",
        client: mockClient,
      });

      expect(res.clusteredCount).toBe(2);
      expect(res.clustersCreated).toBe(1);
      expect(res.shadowReport).toBeDefined();
      expect(res.shadowReport?.totalEvaluated).toBe(1);
      expect(res.shadowReport?.agreements).toBe(1);
      expect(res.shadowReport?.disagreements).toBe(0);
      expect(res.shadowReport?.potentialFalsePositives).toBe(0);
      expect(res.shadowReport?.potentialFalseNegatives).toBe(0);

      // Verify facts were enriched with corroboration status
      const insertedCluster = mockInsertValues.mock.calls[0][0];
      expect(insertedCluster.facts[0].corroborationStatus).toBe("verified");
      expect(insertedCluster.facts[1].corroborationStatus).toBe("verified");
    });

    it("detects False Positive Jaccard where buzzword overlap tricked Jaccard but Jev identifies distinct events", async () => {
      // These stories share heavy token overlap: "final", "game", "championship", "season", "record", "victory"
      const rawItems = [
        {
          id: "item-buzz-1",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Championship victory game record season final showdown recap",
          body: "Golden State secures victory in game final with historic record points.",
          url: "https://sports.example.com/gs-finals",
          publishedAt: new Date(),
          status: "raw",
        },
        {
          id: "item-buzz-2",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Championship victory game record season final ceremony preview",
          body: "Denver celebrates championship victory game record ceremony for new season.",
          url: "https://sports.example.com/denver-ceremony",
          publishedAt: new Date(Date.now() - 3600_000),
          status: "raw",
        },
      ];
      mockFindManyItems.mockResolvedValue(rawItems);

      // Verify Jaccard clusters them due to shared buzzwords
      const overlap = calculateTopicOverlap(
        `${rawItems[0].title} ${rawItems[0].body}`,
        `${rawItems[1].title} ${rawItems[1].body}`,
      );
      expect(overlap).toBeGreaterThanOrEqual(0.25);

      // Jev correctly recognizes they are different events (related league/topic, but distinct incidents)
      const mockClient = {
        systemOne: vi.fn().mockResolvedValue({
          answers: {
            relationship: {
              choice: "related_topic",
              confidence: 0.88,
              probabilities: { same_event: 0.08, related_topic: 0.88, unrelated: 0.04 },
            },
            corroboration: {
              choice: "neutral_or_additive",
              confidence: 0.85,
              probabilities: { corroborates: 0.10, neutral_or_additive: 0.85, contradicts: 0.05 },
            },
          },
        }),
      } as any;

      const res = await clusterSourceItems("tenant-1", "page-tech-1", undefined, {
        mode: "shadow",
        client: mockClient,
      });

      expect(res.shadowReport).toBeDefined();
      expect(res.shadowReport?.totalEvaluated).toBe(1);
      expect(res.shadowReport?.disagreements).toBe(1);
      expect(res.shadowReport?.potentialFalsePositives).toBe(1);
      expect(res.shadowReport?.comparisons[0].disagreementType).toBe("false_positive_jaccard");

      // In shadow mode, Jaccard clustering is still preserved for safety
      expect(res.clustersCreated).toBe(1);
    });

    it("detects False Negative Jaccard where distinct wording missed Jaccard but Jev identifies the same event", async () => {
      // Stories with completely different vocabulary covering the same event
      const rawItems = [
        {
          id: "item-syn-1",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Apple unveils foldable iPhone with revolutionary hinge design",
          body: "Tim Cook introduced the bendable smartphone at the Cupertino theater.",
          url: "https://tech.example.com/foldable-apple",
          publishedAt: new Date(),
          status: "raw",
        },
        {
          id: "item-syn-2",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Cupertino tech giant showcases dual-display handset during keynote",
          body: "Brand new hardware form factor demonstrated live on stage in California.",
          url: "https://gadget.example.com/handset",
          publishedAt: new Date(Date.now() - 3600_000),
          status: "raw",
        },
      ];
      mockFindManyItems.mockResolvedValue(rawItems);

      // Verify Jaccard fails to cluster (overlap < 0.25)
      const overlap = calculateTopicOverlap(
        `${rawItems[0].title} ${rawItems[0].body}`,
        `${rawItems[1].title} ${rawItems[1].body}`,
      );
      expect(overlap).toBeLessThan(0.25);

      // Jev recognizes it's the exact same breaking product reveal
      const mockClient = {
        systemOne: vi.fn().mockResolvedValue({
          answers: {
            relationship: {
              choice: "same_event",
              confidence: 0.92,
              probabilities: { same_event: 0.92, related_topic: 0.06, unrelated: 0.02 },
            },
            corroboration: {
              choice: "corroborates",
              confidence: 0.89,
              probabilities: { corroborates: 0.89, neutral_or_additive: 0.08, contradicts: 0.03 },
            },
          },
        }),
      } as any;

      const res = await clusterSourceItems("tenant-1", "page-tech-1", undefined, {
        mode: "shadow",
        client: mockClient,
      });

      expect(res.shadowReport).toBeDefined();
      expect(res.shadowReport?.potentialFalseNegatives).toBe(1);
      expect(res.shadowReport?.comparisons[0].disagreementType).toBe("false_negative_jaccard");
    });

    it("marks contradictory claims as contradicted in SourcedFact metadata", async () => {
      const rawItems = [
        {
          id: "item-fact-1",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Company X reports record quarterly revenue earnings of 15 billion dollars",
          body: "Company X quarterly revenue earnings report beating financial expectations.",
          url: "https://finance.example.com/q3",
          publishedAt: new Date(),
          status: "raw",
        },
        {
          id: "item-fact-2",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Company X denies record quarterly revenue earnings calling it fraudulent",
          body: "Company X quarterly revenue earnings report denial citing fabricated data.",
          url: "https://news.example.com/denial",
          publishedAt: new Date(Date.now() - 3600_000),
          status: "raw",
        },
      ];
      mockFindManyItems.mockResolvedValue(rawItems);

      const mockClient = {
        systemOne: vi.fn().mockResolvedValue({
          answers: {
            relationship: {
              choice: "same_event",
              confidence: 0.91,
              probabilities: { same_event: 0.91, related_topic: 0.07, unrelated: 0.02 },
            },
            corroboration: {
              choice: "contradicts",
              confidence: 0.93,
              probabilities: { corroborates: 0.03, neutral_or_additive: 0.04, contradicts: 0.93 },
            },
          },
        }),
      } as any;

      await clusterSourceItems("tenant-1", "page-tech-1", undefined, {
        mode: "shadow",
        client: mockClient,
      });

      const insertedCluster = mockInsertValues.mock.calls[0][0];
      // Contradicted claims must be filtered out so angle synthesis never receives them
      expect(insertedCluster.facts).toHaveLength(1);
      expect(insertedCluster.facts[0].corroborationStatus).toBe("verified");
      expect(insertedCluster.facts[0].claim).toBe("Company X reports record quarterly revenue earnings of 15 billion dollars");
      expect(insertedCluster.facts.some((f: any) => f.corroborationStatus === "contradicted")).toBe(false);
    });

    it("actively merges false negative candidates into cluster when mode is 'active'", async () => {
      const rawItems = [
        {
          id: "item-active-1",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "OpenAI announces GPT-5 release date for developers",
          body: "Sam Altman announced the rollout timeline during DevDay.",
          url: "https://ai.example.com/gpt5",
          publishedAt: new Date(),
          status: "raw",
        },
        {
          id: "item-active-2",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Next-gen frontier foundation model scheduled for autumn launch",
          body: "Silicon Valley AI lab confirms developer access schedule next month.",
          url: "https://tech.example.com/frontier",
          publishedAt: new Date(Date.now() - 3600_000),
          status: "raw",
        },
      ];
      mockFindManyItems.mockResolvedValue(rawItems);

      const mockClient = {
        systemOne: vi.fn().mockResolvedValue({
          answers: {
            relationship: {
              choice: "same_event",
              confidence: 0.96,
              probabilities: { same_event: 0.96, related_topic: 0.03, unrelated: 0.01 },
            },
            corroboration: {
              choice: "corroborates",
              confidence: 0.90,
              probabilities: { corroborates: 0.90, neutral_or_additive: 0.08, contradicts: 0.02 },
            },
          },
        }),
      } as any;

      const res = await clusterSourceItems("tenant-1", "page-tech-1", undefined, {
        mode: "active",
        client: mockClient,
      });

      // Active mode merged the synonym story: 1 cluster created containing both items
      expect(res.clustersCreated).toBe(1);
      const insertedCluster = mockInsertValues.mock.calls[0][0];
      expect(insertedCluster.memberItemIds).toEqual(["item-active-1", "item-active-2"]);
    });

    it("fails open gracefully and falls back to pure Jaccard if TypeSafe times out or errors", async () => {
      const rawItems = [
        {
          id: "item-res-1",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Electric vehicle charging infrastructure expansion announced",
          body: "National highway fast charging network receives funding.",
          url: "https://auto.example.com/chargers",
          publishedAt: new Date(),
          status: "raw",
        },
        {
          id: "item-res-2",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Electric vehicle fast charging network receives major funding",
          body: "Highway charging infrastructure to expand nationwide.",
          url: "https://green.example.com/network",
          publishedAt: new Date(Date.now() - 3600_000),
          status: "raw",
        },
      ];
      mockFindManyItems.mockResolvedValue(rawItems);

      const failingClient = {
        systemOne: vi.fn().mockRejectedValue(new Error("API rate limit or connection timeout")),
      } as any;

      // Pipeline should not throw, should cluster via Jaccard without disruption
      const res = await clusterSourceItems("tenant-1", "page-tech-1", undefined, {
        mode: "shadow",
        client: failingClient,
      });

      expect(res.clusteredCount).toBe(2);
      expect(res.clustersCreated).toBe(1);
      expect(mockInsertValues).toHaveBeenCalledTimes(1);
    });

    it("rolls back claimed items to raw if clustering throws or is aborted", async () => {
      const rawItems = [
        {
          id: "item-abort-1",
          tenantId: "tenant-1",
          themePageId: "page-tech-1",
          title: "Quantum breakthrough announced",
          body: "Details of quantum computation.",
          url: "https://science.example.com/quantum",
          publishedAt: new Date(),
          status: "raw",
        },
      ];
      mockFindManyItems.mockResolvedValue(rawItems);

      const controller = new AbortController();
      controller.abort();

      await expect(
        clusterSourceItems("tenant-1", "page-tech-1", controller.signal, { mode: "off" }),
      ).rejects.toThrow();

      // Ensure db.update was called to rollback items to 'raw'
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockDbUpdateSet).toHaveBeenCalledWith({ status: "raw" });
    });
  });
});
