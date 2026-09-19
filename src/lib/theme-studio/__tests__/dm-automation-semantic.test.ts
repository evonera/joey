import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchCommentRuleSemantically, hasCommentIntentMarkers } from "@/lib/typesafe";
import { handleCommentWebhook, CommentWebhookEvent } from "../dm-automation/comment-webhook-handler";

// Mock DB and Zernio
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      dmAutomationRules: {
        findMany: vi.fn(),
      },
      themePages: {
        findFirst: vi.fn().mockResolvedValue({
          name: "Healthy Gourmet",
          niche: "Cooking & Nutrition",
          audience: "Home cooks",
        }),
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

  describe("hasCommentIntentMarkers multi-lingual intent gate", () => {
    it("recognizes inquiry and request markers across languages", () => {
      // English
      expect(hasCommentIntentMarkers("can you please send me the recipe?")).toBe(true);
      expect(hasCommentIntentMarkers("where can I get this template")).toBe(true);
      expect(hasCommentIntentMarkers("link pls")).toBe(true);
      expect(hasCommentIntentMarkers("how much does this cost?")).toBe(true);

      // Spanish
      expect(hasCommentIntentMarkers("¿dónde puedo conseguir la receta?")).toBe(true);
      expect(hasCommentIntentMarkers("mándame el enlace por favor")).toBe(true);
      expect(hasCommentIntentMarkers("quiero info del descuento")).toBe(true);

      // Portuguese
      expect(hasCommentIntentMarkers("me manda o link pfv")).toBe(true);
      expect(hasCommentIntentMarkers("onde vejo essa receita?")).toBe(true);

      // French
      expect(hasCommentIntentMarkers("comment avoir le guide svp?")).toBe(true);
      expect(hasCommentIntentMarkers("je veux le lien")).toBe(true);
      expect(hasCommentIntentMarkers("le livre est où")).toBe(true);

      // German
      expect(hasCommentIntentMarkers("schick mir bitte das rezept")).toBe(true);
      expect(hasCommentIntentMarkers("wo finde ich die anleitung?")).toBe(true);

      // Italian
      expect(hasCommentIntentMarkers("mandami la ricetta per favore")).toBe(true);
      expect(hasCommentIntentMarkers("dove trovo il link?")).toBe(true);

      // Hindi / Hinglish
      expect(hasCommentIntentMarkers("link bhejo bhai")).toBe(true);
      expect(hasCommentIntentMarkers("kaise milega ye?")).toBe(true);

      // Indonesian
      expect(hasCommentIntentMarkers("bagi resepnya dong")).toBe(true);
      expect(hasCommentIntentMarkers("gimana cara dapatnya?")).toBe(true);

      // Question marks in any language
      expect(hasCommentIntentMarkers("what?")).toBe(true);
      expect(hasCommentIntentMarkers("¿esto sirve para hornear?")).toBe(true);
    });

    it("matches custom trigger keywords from active rules even without standard request words", () => {
      expect(hasCommentIntentMarkers("I love RECIPE ideas", ["RECIPE"])).toBe(true);
      expect(hasCommentIntentMarkers("discount applied", ["DISCOUNT"])).toBe(true);
    });

    it("rejects purely conversational, emoji-only, or vanity praise comments in 0ms", () => {
      expect(hasCommentIntentMarkers("🔥🔥🔥")).toBe(false);
      expect(hasCommentIntentMarkers("Amazing photo!")).toBe(false);
      expect(hasCommentIntentMarkers("love this so much")).toBe(false);
      expect(hasCommentIntentMarkers("first!!")).toBe(false);
      expect(hasCommentIntentMarkers("Hermosa foto")).toBe(false);
      expect(hasCommentIntentMarkers("Magnifique")).toBe(false);
      expect(hasCommentIntentMarkers("so true bro lol")).toBe(false);
      expect(hasCommentIntentMarkers("")).toBe(false);
    });
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
        {
          client: mockClient,
          confidenceThreshold: 0.85,
          pageContext: { name: "Healthy Gourmet", niche: "Cooking", audience: "Foodies" },
        },
      );

      expect(matched).toBeDefined();
      expect(matched?.id).toBe("rule-recipe-1");
      expect(matched?.triggerValue).toBe("RECIPE");
    });

    it("drops low-signal praise comments locally before calling Jev", async () => {
      const mockClient = {
        systemOne: vi.fn(),
      } as any;

      const matched = await matchCommentRuleSemantically(
        "This looks absolutely gorgeous, great work!",
        sampleRules,
        "tenant-1",
        { client: mockClient, confidenceThreshold: 0.85 },
      );

      // Never contacted Jev!
      expect(mockClient.systemOne).not.toHaveBeenCalled();
      expect(matched).toBeNull();
    });

    it("returns null when Jev selects 'none' on an inquiry comment", async () => {
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
        "Can you tell me what camera did you use to film this video?",
        sampleRules,
        "tenant-1",
        { client: mockClient, confidenceThreshold: 0.85 },
      );

      expect(mockClient.systemOne).toHaveBeenCalled();
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
        "send recipe please",
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
        expect.objectContaining({
          pageContext: expect.objectContaining({ name: "Healthy Gourmet" }),
        }),
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

  describe("resolveTypesafeApiKey credential isolation", () => {
    it("does not fall back to process.env.TYPESAFE_API_KEY if tenant key row is empty or decryption fails", async () => {
      const { resolveTypesafeApiKey } = await import("@/lib/typesafe");
      const { db } = await import("@/lib/db");

      // Set environment fallback
      const prevEnv = process.env.TYPESAFE_API_KEY;
      process.env.TYPESAFE_API_KEY = "env-typesafe-key-123";

      try {
        // Tenant row exists but decryption fails/empty
        (db.query as any).apiKeys = {
          findFirst: vi.fn().mockResolvedValue({
            tenantId: "broken-tenant",
            provider: "typesafe",
            status: "active",
            encryptedKey: null,
          }),
        };

        const resolved = await resolveTypesafeApiKey("broken-tenant");
        expect(resolved).toBeNull();
      } finally {
        process.env.TYPESAFE_API_KEY = prevEnv;
      }
    });
  });
});
