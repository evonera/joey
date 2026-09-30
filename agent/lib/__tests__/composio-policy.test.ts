import { describe, expect, it } from "vitest";
import { composioConnectionApproval } from "../composio-policy";

describe("Composio Eve approval policy", () => {
  it("requires explicit human approval for account authorization and tool execution", () => {
    expect(composioConnectionApproval("composio__COMPOSIO_MANAGE_CONNECTIONS")).toBe("user-approval");
    expect(composioConnectionApproval("composio__COMPOSIO_MULTI_EXECUTE_TOOL")).toBe("user-approval");
  });

  it("allows only non-mutating discovery and schema lookup without a prompt", () => {
    expect(composioConnectionApproval("composio__COMPOSIO_SEARCH_TOOLS")).toBe("not-applicable");
    expect(composioConnectionApproval("composio__COMPOSIO_GET_TOOL_SCHEMAS")).toBe("not-applicable");
  });
});
