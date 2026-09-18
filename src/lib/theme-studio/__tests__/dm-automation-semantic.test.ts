import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchCommentRuleSemantically } from "@/lib/typesafe";
import { handleCommentWebhook, CommentWebhookEvent } from "../dm-automation/comment-webhook-handler";

// Mock DB and Zernio
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      dmAutomationRules: {
        findMany: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

vi.mock("@/lib/publisher-core", () => ({
  getZernioClientForTenant: vi.fn().mockResolvedValue({
    zernio: {
      comments: {
        sendPrivateReplyToComment: vi.fn().mockResolvedValue({
          data: { messageId: "msg_test_123" },
        }),
      },
    },
  }),
}));

describe("TypeSafe Jev DM Automation Semantic Matcher", () => {
  const sampleRules = [
    {
      id: "rule-recipe-1",
      tenantId: "tenant-1",
      themePageId: "page-1",
      triggerType: "keyword",
      triggerValue: "RECIPE",
      responseTemplate: "Hi {{username}}, here is the recipe: {{link}}",
      responseLink: "https://example.com/recipe",
      isActive: true,
      stats: { triggered: 0, dmsSent: 0, clicks: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "rule-discount-2",
      tenantId: "tenant-1",
      themePageId: "page-1",
      triggerType: "keyword",
      triggerValue: "DISCOUNT",
      responseTemplate: "Hi {{username}}, use code JOEY20 for 20% off: {{link}}",
      responseLink: "https://example.com/shop",
      isActive: true,
      stats: { triggered: 0, dmsSent: 0, clicks: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("matchCommentRuleSemantically unit tests", () => {
    it("returns matching rule when Jev selects it with high confidence", async () => {
      const mockClient = {
        systemOne: vi.fn().mockResolvedValue({
          model: "jev-1.13.0",
          answers: {
            intent: {
              type: "choice",
              choice: "rule_rule-recipe-1",
              confidence: 0.96,
              probabilities: {
                "rule_rule-recipe-1": 0.94,
                "rule_rule-discount-2": 0.02,
                none: 0.04,
              },
            },
          },
        }),
      } as any;

      const matched = await matchCommentRuleSemantically(
        "Where can I find the ingredients and cooking instructions for this dish?",
        sampleRules,
        "tenant-1",
        { client: mockClient, confidenceThreshold: 0.85 },
      );

      expect(matched).toBeDefined();
      expect(matched?.id).toBe("rule-recipe-1");
      expect(matched?.triggerValue).toBe("RECIPE");
    });

    it("returns null when Jev selects 'none'", async () => {
      const mockClient = {
        systemOne: vi.fn().mockResolvedValue({
          model: "jev-1.13.0",
          answers: {
            intent: {
              type: "choice",
              choice: "none",
              confidence: 0.99,
              probabilities: {
                "rule_rule-recipe-1": 0.01,
                "rule_rule-discount-2": 0.0,
                none: 0.99,
              },
            },
          },
        }),
      } as any;

      const matched = await matchCommentRuleSemantically(
        "This looks absolutely gorgeous, great work!",
        sampleRules,
        "tenant-1",
        { client: mockClient, confidenceThreshold: 0.85 },
      );

      expect(matched).toBeNull();
    });

    it("rejects match when confidence is below the threshold", async () => {
      const mockClient = {
        systemOne: vi.fn().mockResolvedValue({
          model: "jev-1.13.0",
          answers: {
            intent: {
              type: "choice",
              choice: "rule_rule-recipe-1",
              confidence: 0.70, // below 0.85
              probabilities: {
                "rule_rule-recipe-1": 0.65,
                "rule_rule-discount-2": 0.10,
                none: 0.25,
              },
            },
          },
        }),
      } as any;

      const matched = await matchCommentRuleSemantically(
        "Is this food?",
        sampleRules,
        "tenant-1",
        { client: mockClient, confidenceThreshold: 0.85 },
      );

      expect(matched).toBeNull();
    });

    it("gracefully catches errors and returns null without throwing", async () => {
      const mockClient = {
        systemOne: vi.fn().mockRejectedValue(new Error("TypeSafe API timeout")),
      } as any;

      const matched = await matchCommentRuleSemantically(
        "send recipe",
        sampleRules,
        "tenant-1",
        { client: mockClient },
      );

      expect(matched).toBeNull();
    });
  });

  describe("handleCommentWebhook integration with Jev fallback", () => {
    it("uses the fast-path regex when exact keyword is present", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.query.dmAutomationRules.findMany).mockResolvedValue(sampleRules as any);

      const event: CommentWebhookEvent = {
        tenantId: "tenant-1",
        themePageId: "page-1",
        accountId: "acc-1",
        platform: "instagram",
        postId: "post-1",
        commentId: "comment-1",
        authorUsername: "sarah_cooks",
        authorId: "user-1",
        commentText: "Can you send the RECIPE please!",
      };

      const result = await handleCommentWebhook(event);

      expect(result.matched).toBe(true);
      expect(result.success).toBe(true);
      expect(result.ruleId).toBe("rule-recipe-1");
      expect(result.triggerKeyword).toBe("RECIPE"); // fast-path keyword (not marked semantic)
      expect(result.dispatchedMessage).toContain("sarah_cooks");
      expect(result.dispatchedMessage).toContain("https://example.com/recipe");
    });

    it("falls back to semantic Jev matching when keyword is absent but intent is clear", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.query.dmAutomationRules.findMany).mockResolvedValue(sampleRules as any);

      // Spy on matchCommentRuleSemantically to simulate Jev matching
      const typesafeModule = await import("@/lib/typesafe");
      const spy = vi.spyOn(typesafeModule, "matchCommentRuleSemantically").mockResolvedValue(sampleRules[0] as any);

      const event: CommentWebhookEvent = {
        tenantId: "tenant-1",
        themePageId: "page-1",
        accountId: "acc-1",
        platform: "instagram",
        postId: "post-1",
        commentId: "comment-2",
        authorUsername: "alex_fitness",
        authorId: "user-2",
        commentText: "Where can I get the full list of ingredients and preparation steps?",
      };

      const result = await handleCommentWebhook(event);

      expect(spy).toHaveBeenCalledWith(
        "Where can I get the full list of ingredients and preparation steps?",
        sampleRules,
        "tenant-1",
      );
      expect(result.matched).toBe(true);
      expect(result.success).toBe(true);
      expect(result.ruleId).toBe("rule-recipe-1");
      expect(result.triggerKeyword).toBe("RECIPE (semantic)");
      expect(result.dispatchedMessage).toContain("alex_fitness");
    });

    it("does not send a DM when comment is unrelated and Jev finds no match", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.query.dmAutomationRules.findMany).mockResolvedValue(sampleRules as any);

      const typesafeModule = await import("@/lib/typesafe");
      vi.spyOn(typesafeModule, "matchCommentRuleSemantically").mockResolvedValue(null);

      const event: CommentWebhookEvent = {
        tenantId: "tenant-1",
        themePageId: "page-1",
        accountId: "acc-1",
        platform: "instagram",
        postId: "post-1",
        commentId: "comment-3",
        authorUsername: "nice_guy",
        authorId: "user-3",
        commentText: "Love this so much, keep up the amazing content! 🔥",
      };

      const result = await handleCommentWebhook(event);

      expect(result.matched).toBe(false);
      expect(result.success).toBe(true);
    });
  });
});
