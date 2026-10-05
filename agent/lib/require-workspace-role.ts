import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema";

type Caller = {
  principalId: string;
  principalType: string;
  attributes?: Record<string, unknown>;
};

/** Agent callers have no browser cookies: resolve role from their authenticated principal. */
export async function requireWorkspaceRole(
  caller: Caller | null | undefined,
  allowedRoles = ["owner", "admin"],
): Promise<string> {
  const tenantId = caller?.attributes?.tenantId;
  if (!caller || caller.principalType !== "user" || typeof tenantId !== "string") throw new Error("Unauthorized");
  let userId = caller.principalId;
  try {
    const identity: unknown = JSON.parse(userId);
    if (Array.isArray(identity)) {
      if (identity[1] !== tenantId || typeof identity[0] !== "string") throw new Error("Invalid principal");
      userId = identity[0];
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid principal") throw error;
    // Cron identities use the authenticated user's plain ID.
  }
  const membership = await db.query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.organizationId, tenantId)),
  });
  if (!membership || !allowedRoles.includes(membership.role)) throw new Error("Forbidden: Workspace role does not permit this action");
  return tenantId;
}
