import { describe, expect, it, vi, beforeEach } from "vitest";

const mockScoutFindMany = vi.fn();
const mockScoutFindFirst = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      scouts: {
        findMany: (...args: unknown[]) => mockScoutFindMany(...args),
        findFirst: (...args: unknown[]) => mockScoutFindFirst(...args),
      },
      member: {
        findFirst: vi.fn().mockResolvedValue({ userId: "owner-1", role: "owner" }),
      },
      usageTracking: {
        findFirst: vi.fn().mockResolvedValue({
          id: "u-1",
          tenantId: "tenant-1",
          inputTokensUsed: 0,
          outputTokensUsed: 0,
          estimatedCostUsd: "0",
          reservedCostUsd: "0",
          budgetLimitUsd: "100.00",
        }),
      },
    },
    insert: () => ({
      values: (...args: unknown[]) => {
        mockInsert(...args);
        return {
          returning: () => [
            {
              id: "scout-123",
              name: "Test Scout",
              targetUrl: "https://instagram.com/test",
              platform: "instagram",
              goalCondition: "Alert when views > 50k",
            },
          ],
        };
      },
    }),
    update: () => ({
      set: (...args: unknown[]) => {
        mockUpdate(...args);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      },
    }),
  },
}));

vi.mock("@/lib/agent-model-resolver", () => ({
  resolveModelForTurn: vi.fn().mockResolvedValue({
    model: { modelId: "test-model" },
    modelContextWindowTokens: 8000,
  }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      triggered: true,
      summary: "Viral spike detected on recent post with 125,000 views.",
      changes: [
        {
          metric: "views",
          before: "12,000 avg",
          after: "125,000 spike",
          detail: "Stop scrolling hook drove 10x normal views",
        },
      ],
      recommendedAction: "Remix hook into Theme Studio reel.",
    }),
  }),
}));

vi.mock("@/lib/flows/nodes/data/apify-actor", () => ({
  resolveToken: vi.fn().mockRejectedValue(new Error("No Apify token")),
}));

const mockEvaluateScoutTriggerSemantically = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/typesafe", () => ({
  evaluateScoutTriggerSemantically: (...args: any[]) => mockEvaluateScoutTriggerSemantically(...args),
}));

describe("Scouts Evaluator and Tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when scout is not found", async () => {
    mockScoutFindFirst.mockResolvedValueOnce(null);
    const { evaluateScout } = await import("../evaluator");
    await expect(evaluateScout("non-existent")).rejects.toThrow("not found");
  });

  it("throws when tenantId does not match", async () => {
    mockScoutFindFirst.mockResolvedValueOnce({
      id: "scout-1",
      tenantId: "tenant-other",
      name: "Competitor",
    });
    const { evaluateScout } = await import("../evaluator");
    await expect(evaluateScout("scout-1", { tenantId: "tenant-mine" })).rejects.toThrow("does not belong to tenant");
  });

  it("evaluates a scout and detects simulated viral spike", async () => {
    mockScoutFindFirst.mockResolvedValueOnce({
      id: "scout-1",
      tenantId: "tenant-1",
      name: "Viral Competitor",
      targetUrl: "https://instagram.com/viral",
      platform: "instagram",
      goalCondition: "Alert when views > 50k",
      latestAlert: null,
    });

    const { evaluateScout } = await import("../evaluator");
    const res = await evaluateScout("scout-1");

    expect(res.triggered).toBe(true);
    expect(res.alert).toBeDefined();
    expect(res.alert?.changes.length).toBeGreaterThan(0);
    expect(res.itemsFound).toBeGreaterThan(0);
  });

  it("short-circuits routine runs via TypeSafe Jev pre-gate and skips Gemini LLM call", async () => {
    mockScoutFindFirst.mockResolvedValueOnce({
      id: "scout-quiet",
      tenantId: "tenant-1",
      name: "Quiet Competitor",
      targetUrl: "https://instagram.com/quiet",
      platform: "instagram",
      goalCondition: "Alert when views > 100k",
      latestAlert: null,
    });

    mockEvaluateScoutTriggerSemantically.mockResolvedValueOnce({
      triggered: false,
      confidence: 0.95,
      probability: 0.98,
    });

    const { generateText } = await import("ai");
    const { evaluateScout } = await import("../evaluator");
    const res = await evaluateScout("scout-quiet", { force: true });

    expect(res.triggered).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("manage_scouts tool handles list and create actions", async () => {
    const tool = (await import("../../../../agent/tools/manage_scouts")).default as any;
    const ctx = { session: { auth: { current: { attributes: { tenantId: "tenant-1" } } } } };

    mockScoutFindMany.mockResolvedValueOnce([
      {
        id: "scout-1",
        name: "Test",
        targetUrl: "https://instagram.com/test",
        platform: "instagram",
        goalCondition: "Views > 50k",
        isActive: true,
        pollIntervalMinutes: 120,
        lastPolledAt: new Date(),
        latestAlert: null,
      },
    ]);

    const listRes = await tool.execute({ action: "list" }, ctx);
    expect(listRes.total).toBe(1);
    expect(listRes.scouts[0].name).toBe("Test");

    const createRes = await tool.execute(
      {
        action: "create",
        name: "New Scout",
        targetUrl: "https://instagram.com/new",
        goalCondition: "Spike alerts",
      },
      ctx
    );
    expect(createRes.message).toContain("created successfully");
  });

  it("fails cleanly without generating fake posts in production when Apify is unconfigured", async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      mockScoutFindFirst.mockResolvedValueOnce({
        id: "scout-prod",
        tenantId: "tenant-prod",
        name: "Real Competitor",
        targetUrl: "https://instagram.com/real",
        platform: "instagram",
        goalCondition: "Alert when views > 50k",
        latestAlert: null,
      });

      const { evaluateScout } = await import("../evaluator");
      const res = await evaluateScout("scout-prod", { force: true });

      expect(res.triggered).toBe(false);
      expect(res.itemsFound).toBe(0);
      expect(res.error).toContain("Apify integration not configured");
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  it("records failed status when Apify returns non-2xx HTTP status", async () => {
    const { resolveToken } = await import("@/lib/flows/nodes/data/apify-actor");
    (resolveToken as any).mockResolvedValueOnce("apify_token_test");

    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 402,
        text: vi.fn().mockResolvedValue("Payment Required: Monthly Apify compute units exhausted"),
      }) as any;

      mockScoutFindFirst.mockResolvedValueOnce({
        id: "scout-apify-fail",
        tenantId: "tenant-1",
        name: "Rate Limited Competitor",
        targetUrl: "https://instagram.com/ratelimited",
        platform: "instagram",
        goalCondition: "Alert when views > 50k",
        latestAlert: null,
      });

      const { evaluateScout } = await import("../evaluator");
      const res = await evaluateScout("scout-apify-fail", { force: true });

      expect(res.triggered).toBe(false);
      expect(res.itemsFound).toBe(0);
      expect(res.error).toContain("Apify scraper returned HTTP 402");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

