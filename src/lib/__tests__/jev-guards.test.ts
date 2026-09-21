import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    query: {
      apiKeys: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  },
}));

import {
  checkJevBudget,
  evaluateStoryAffinitySemantically,
  getClusteringMode,
  hasCommentIntentMarkers,
  isJevFeatureEnabled,
  matchCommentRuleSemantically,
  passesJevThresholds,
  recordJevUsage,
  resetJevBudgetForTests,
} from "@/lib/typesafe";

const tenant = "tenant-jev-guard-test";

describe("cautious Jev guards", () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    resetJevBudgetForTests();
    vi.clearAllMocks();
    delete process.env.TYPESAFE_SCOUT_GATE;
    delete process.env.TYPESAFE_DM_FALLBACK;
    delete process.env.THEME_STUDIO_CLUSTERING_MODE;
    delete process.env.JEV_DAILY_CAP;
    delete process.env.JEV_MONTHLY_CAP;
  });

  afterEach(() => {
    process.env = { ...prevEnv };
    resetJevBudgetForTests();
  });

  it("clustering defaults to off even when a key exists", () => {
    expect(getClusteringMode()).toBe("off");
    expect(isJevFeatureEnabled("cluster")).toBe(false);
    expect(getClusteringMode("shadow")).toBe("shadow");
  });

  it("scout and DM gates default on but respect explicit false", () => {
    expect(isJevFeatureEnabled("scout")).toBe(true);
    expect(isJevFeatureEnabled("dm")).toBe(true);
    process.env.TYPESAFE_SCOUT_GATE = "false";
    process.env.TYPESAFE_DM_FALLBACK = "false";
    expect(isJevFeatureEnabled("scout")).toBe(false);
    expect(isJevFeatureEnabled("dm")).toBe(false);
  });

  it("requires both confidence and probability", () => {
    expect(passesJevThresholds(0.9, 0.8, 0.85, 0.75)).toBe(true);
    expect(passesJevThresholds(0.9, 0.5, 0.85, 0.75)).toBe(false);
    expect(passesJevThresholds(0.5, 0.9, 0.85, 0.75)).toBe(false);
  });

  it("daily cap blocks further Jev calls", async () => {
    process.env.JEV_DAILY_CAP = "2";
    process.env.JEV_MONTHLY_CAP = "100";
    expect(checkJevBudget(tenant).allowed).toBe(true);
    await recordJevUsage({ tenantId: tenant, feature: "scout", latencyMs: 5 });
    await recordJevUsage({ tenantId: tenant, feature: "scout", latencyMs: 5 });
    const blocked = checkJevBudget(tenant);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/daily cap/);
  });

  it("emoji-only comments never reach Jev (no client call)", async () => {
    const rules = [{ id: "r1", triggerValue: "RECIPE" }];
    expect(hasCommentIntentMarkers("🔥🔥 😍 so good", ["RECIPE"])).toBe(false);
    const systemOne = vi.fn();
    const result = await matchCommentRuleSemantically("🔥🔥 😍 so good", rules, tenant, {
      client: { systemOne } as never,
    });
    expect(result).toBeNull();
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("DM fallback flag off avoids Jev even with intent markers", async () => {
    process.env.TYPESAFE_DM_FALLBACK = "false";
    const systemOne = vi.fn();
    const result = await matchCommentRuleSemantically(
      "please send me the recipe?",
      [{ id: "r1", triggerValue: "RECIPE" }],
      tenant,
      { client: { systemOne } as never },
    );
    expect(result).toBeNull();
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("low probability below threshold returns null and logs fallback", async () => {
    const systemOne = vi.fn().mockResolvedValue({
      model: "jev-test",
      answers: {
        intent: { choice: "rule_r1", confidence: 0.95, probabilities: { rule_r1: 0.4 } },
      },
    });
    const result = await matchCommentRuleSemantically(
      "please send recipe?",
      [{ id: "r1", triggerValue: "RECIPE" }],
      tenant,
      { client: { systemOne } as never },
    );
    expect(result).toBeNull();
    expect(systemOne).toHaveBeenCalledTimes(1);
  });

  it("story affinity stays off by default even with a mock client", async () => {
    const systemOne = vi.fn();
    const result = await evaluateStoryAffinitySemantically(
      { title: "Story A" },
      { title: "Story B" },
      tenant,
      { client: { systemOne } as never },
    );
    expect(result).toBeNull();
    expect(systemOne).not.toHaveBeenCalled();
  });
});
