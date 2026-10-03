import type { ApprovalConfiguration } from "eve/tools/approval";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema";
import { workspaceApproval } from "./workspace-approval";

const WRITE_OR_AUTH_TOOLS = ["COMPOSIO_MANAGE_CONNECTIONS", "COMPOSIO_MULTI_EXECUTE_TOOL"] as const;
const READ_TOOLS = ["COMPOSIO_SEARCH_TOOLS", "COMPOSIO_GET_TOOL_SCHEMAS"] as const;

function exactTool(toolName: string, names: readonly string[]) {
  return names.some(name => toolName === name || toolName === `composio__${name}`);
}

/** Gate account authorization and every external action for an explicit human approval. */
export function composioConnectionApproval(toolName: string): "user-approval" | "not-applicable" | "denied" {
  if (exactTool(toolName, WRITE_OR_AUTH_TOOLS)) return "user-approval";
  return exactTool(toolName, READ_TOOLS) ? "not-applicable" : "denied";
}

/** Confirmation is not authorization. Recheck current membership on every call
 * and on resume; approvedTools is deliberately not a persistent grant. */
export function composioApproval(): ApprovalConfiguration {
  return {
    request: async ctx => {
      const decision = composioConnectionApproval(ctx.toolName);
      if (decision === "denied") return { type: "denied", reason: "Unsupported Composio tool." };
      const current = ctx.session.auth.current;
      const tenantId = current?.attributes?.tenantId;
      const initiatorTenant = ctx.session.auth.initiator?.attributes?.tenantId;
      if (current?.principalType !== "user" || typeof tenantId !== "string" || tenantId !== initiatorTenant)
        return { type: "denied", reason: "A workspace-bound user session is required." };
      let userId = current.principalId;
      try {
        const identity: unknown = JSON.parse(userId);
        if (!Array.isArray(identity) || typeof identity[0] !== "string" || identity[1] !== tenantId)
          return { type: "denied", reason: "Invalid workspace identity." };
        userId = identity[0];
      } catch { /* Plain server-authenticated user IDs are also supported. */ }
      if (!userId) return { type: "denied", reason: "A user is required." };
      let membership;
      try {
        membership = await db.query.member.findFirst({
          where: and(eq(member.organizationId, tenantId), eq(member.userId, userId),
            ...(decision === "user-approval" ? [inArray(member.role, ["owner", "admin"])] : [])),
          columns: { id: true },
        });
      } catch { return { type: "denied", reason: "Workspace authorization is unavailable." }; }
      if (!membership) return { type: "denied", reason: "Current workspace permission is required." };
      return decision;
    },
    response: async ctx => {
      if (composioConnectionApproval(ctx.request.toolName) !== "user-approval")
        return { status: "rejected", reason: "Unsupported Composio approval." };
      try { return await workspaceApproval().response!(ctx); }
      catch { return { status: "rejected", reason: "Workspace authorization is unavailable." }; }
    },
  };
}
