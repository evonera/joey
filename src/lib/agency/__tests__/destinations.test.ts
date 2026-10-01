import { describe, expect, it } from "vitest";
import { agencyDestinationIds } from "../destinations";
describe("Automation destination fence", () => {
  it("retains ordinary Theme Page publishing", () =>
    expect(agencyDestinationIds({}, ["one", "two"])).toEqual(["one", "two"]));
  it("never broadens bindings when the page gains new accounts", () =>
    expect(
      agencyDestinationIds({ customAgentId: "agent", destinationAccountIds: ["one", "removed"] }, ["one", "new"])
    ).toEqual(["one"]));
  it.each([{}, { destinationAccountIds: [] }, { destinationAccountIds: [null] }, { destinationAccountIds: "all" }])(
    "fails closed on malformed agency provenance %j",
    (origin) => expect(agencyDestinationIds({ customAgentId: "agent", ...origin }, ["one"])).toEqual([])
  );
});
