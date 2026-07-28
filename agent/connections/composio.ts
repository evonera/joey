import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://connect.composio.dev/mcp",
  description:
    "Composio: gateway to the user's connected apps (Gmail, Google Calendar, Notion, Slack, GitHub, Linear, and 1000+ more). Search for app tools, connect or authorize apps (returns an OAuth link to show the user), check connection status, and execute app actions like reading news, searching the web, or managing documents.",
  headers: (ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    return {
      "x-consumer-api-key": process.env.COMPOSIO_API_KEY!,
      ...(tenantId ? {
        "x-composio-entity-id": tenantId as string,
        "x-composio-user-id": tenantId as string,
      } : {}),
    };
  },
});
