import { describe, expect, it } from "vitest";
import { getPlanDefinition, PLAN_CATALOG } from "@/lib/plans";

describe("plan catalog", () => {
  it("keeps launch pricing and resource limits coherent", () => {
    expect(PLAN_CATALOG.creator).toMatchObject({
      monthlyPrice: 19,
      maxConnectedAccounts: 3,
      themePageLimit: 3,
      maxWorkspaces: 1,
    });
    expect(PLAN_CATALOG.pro).toMatchObject({
      monthlyPrice: 59,
      maxConnectedAccounts: 8,
      themePageLimit: 8,
      maxWorkspaces: 3,
    });
    expect(PLAN_CATALOG.agency).toMatchObject({
      monthlyPrice: 149,
      maxConnectedAccounts: 15,
      themePageLimit: 20,
      maxWorkspaces: 10,
    });
  });

  it("fails closed to the free plan for unknown stored plan values", () => {
    expect(getPlanDefinition("unknown")).toBe(PLAN_CATALOG.free);
    expect(getPlanDefinition(null)).toBe(PLAN_CATALOG.free);
  });
});
