import { describe, expect, it } from "vitest";
import { matchingPackageAccounts, packageDestinationIds } from "./destinations";

describe("theme package destinations", () => {
  const accounts = [
    { id: "a", platform: "x", isActive: true },
    { id: "b", platform: "twitter", isActive: true },
    { id: "c", platform: "instagram", isActive: true },
    { id: "d", platform: "x", isActive: false },
  ];
  it("keeps an existing retry account first and includes other eligible accounts", () => {
    const ids = packageDestinationIds(null, ["a", "b", "c", "d"], { publishAccountId: "b" });
    expect(matchingPackageAccounts(accounts, "x", ids.selectedAccountIds, ids.priorAccountId).map(a => a.id)).toEqual(["b", "a"]);
  });
  it("limits an agency package to linked and authorized destinations", () => {
    const ids = packageDestinationIds({ customAgentId: "agent", destinationAccountIds: ["a"] }, ["a", "b"], { publishAccountId: "b" });
    expect(ids.priorAccountId).toBeUndefined();
    expect(matchingPackageAccounts(accounts, "x", ids.selectedAccountIds, ids.priorAccountId).map(a => a.id)).toEqual(["a"]);
  });
  it("retains an unlinked prior account for a non-agency retry", () => {
    const ids = packageDestinationIds(null, ["a"], { publishAccountId: "b" });
    expect(ids.lookupIds).toEqual(["a", "b"]);
    expect(matchingPackageAccounts(accounts, "x", ids.selectedAccountIds, ids.priorAccountId).map(a => a.id)).toEqual(["b", "a"]);
  });
  it("keeps selected accounts with unknown active state but requires an active prior account", () => {
    const unknown = [{ id: "u", platform: "x", isActive: null }];
    expect(matchingPackageAccounts(unknown, "x", [], "u")).toEqual([]);
    expect(matchingPackageAccounts(unknown, "x", ["u"], "u")).toEqual(unknown);
  });
});
