const WRITE_OR_AUTH_TOOLS = ["COMPOSIO_MANAGE_CONNECTIONS", "COMPOSIO_MULTI_EXECUTE_TOOL"] as const;

/** Gate account authorization and every external action for an explicit human approval. */
export function composioConnectionApproval(toolName: string): "user-approval" | "not-applicable" {
  return WRITE_OR_AUTH_TOOLS.some((name) => toolName.endsWith(name)) ? "user-approval" : "not-applicable";
}
