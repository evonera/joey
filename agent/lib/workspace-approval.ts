import type {
  ApprovalConfiguration,
  ApprovalContext,
  ApprovalResponseContext,
} from "eve/tools/approval";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema";

const APPROVER_ROLES = ["owner", "admin"] as const;

function responderUserId(principalId: string): string | null {
  try {
    const parsed = JSON.parse(principalId);
    return Array.isArray(parsed) && typeof parsed[0] === "string" ? parsed[0] : null;
  } catch {
    return principalId || null;
  }
}

async function isWorkspaceApprover(
  ctx: ApprovalResponseContext,
): Promise<boolean> {
  const tenantId = ctx.responder.attributes?.tenantId;
  const sessionTenantId = ctx.session.initiator?.attributes?.tenantId;
  const userId = responderUserId(ctx.responder.principalId);
  if (
    ctx.responder.principalType !== "user" ||
    typeof tenantId !== "string" ||
    tenantId !== sessionTenantId ||
    !userId
  ) {
    return false;
  }

  const membership = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, tenantId),
      eq(member.userId, userId),
      inArray(member.role, [...APPROVER_ROLES]),
    ),
    columns: { id: true },
  });
  return Boolean(membership);
}

async function isTrustedWorkspaceAutomation(
  ctx: ApprovalContext,
  automationKind: string,
): Promise<boolean> {
  const caller = ctx.session.auth.current;
  const tenantId = caller?.attributes?.tenantId;
  if (
    caller?.authenticator !== "cron" ||
    caller.principalType !== "user" ||
    typeof tenantId !== "string" ||
    caller.attributes?.automationKind !== automationKind ||
    !caller.principalId
  ) {
    return false;
  }
  const membership = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, tenantId),
      eq(member.userId, caller.principalId),
      eq(member.role, "owner"),
    ),
    columns: { id: true },
  });
  return Boolean(membership);
}

export function workspaceApproval(options?: {
  allowOwnerAutomationKind?: string;
}): ApprovalConfiguration {
  return {
    request: async (ctx) =>
      options?.allowOwnerAutomationKind &&
      (await isTrustedWorkspaceAutomation(ctx, options.allowOwnerAutomationKind))
        ? { type: "approved", reason: "Authorized workspace-owner automation." }
        : "user-approval",
    response: async (ctx) =>
      (await isWorkspaceApprover(ctx))
        ? { status: "allowed" }
        : {
            status: "rejected",
            reason: "Only a workspace owner or admin can approve this action.",
          },
  };
}
