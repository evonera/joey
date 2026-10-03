import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { composioApproval } from "../lib/composio-policy";
import { agencySessionIdentity } from "../lib/agency-session";

const connection = defineMcpClientConnection({
  url: "https://connect.composio.dev/mcp",
  description:
    "Composio research connector for reading/searching connected apps. Ask permission before connecting an app or executing any external action. Use Joey's first-party tools for drafting, scheduling, publishing, and account management.",
  tools: { allow: ["COMPOSIO_SEARCH_TOOLS", "COMPOSIO_GET_TOOL_SCHEMAS", "COMPOSIO_MANAGE_CONNECTIONS", "COMPOSIO_MULTI_EXECUTE_TOOL"] },
  approval: composioApproval(),
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

// Custom draft-only personas use first-party research. Do not expose the
// connected-app discovery/authorization surface to this narrower persona.
export default defineDynamic({ events: {
  "session.started": (_event, ctx) => agencySessionIdentity(ctx.session) ? null : connection,
  "turn.started": (_event, ctx) => agencySessionIdentity(ctx.session) ? null : connection,
} });
