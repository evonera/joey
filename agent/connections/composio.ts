import { defineMcpClientConnection } from "eve/connections";
import { composioConnectionApproval } from "../lib/composio-policy";

export default defineMcpClientConnection({
  url: "https://connect.composio.dev/mcp",
  description:
    "Composio research connector for reading/searching connected apps. Ask permission before connecting an app or executing any external action. Use Joey's first-party tools for drafting, scheduling, publishing, and account management.",
  tools: { allow: ["COMPOSIO_SEARCH_TOOLS", "COMPOSIO_GET_TOOL_SCHEMAS", "COMPOSIO_MANAGE_CONNECTIONS", "COMPOSIO_MULTI_EXECUTE_TOOL"] },
  approval: ({ toolName }) => composioConnectionApproval(toolName),
  headers: (ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    const apiKey = process.env.COMPOSIO_API_KEY;
    return {
      ...(apiKey ? { "x-consumer-api-key": apiKey } : {}),
      ...(tenantId ? {
        "x-composio-entity-id": tenantId as string,
        "x-composio-user-id": tenantId as string,
      } : {}),
    };
  },
});
