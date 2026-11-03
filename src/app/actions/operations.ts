"use server";

import { getActiveTenantId } from "@/lib/auth";
import { getOperationalHealth } from "@/lib/operations";

export async function getTenantOperationalHealth() {
  const tenantId = await getActiveTenantId();
  return getOperationalHealth(tenantId);
}

export async function listUncertainPrivateReplies() {
  const { db } = await import("@/lib/db");
  const { engagementItems } = await import("@/lib/db/schema");
  const { and, eq, desc } = await import("drizzle-orm");
  const tenantId = await getActiveTenantId();
  return db.query.engagementItems.findMany({
    where: and(eq(engagementItems.tenantId, tenantId), eq(engagementItems.dmDispatchStatus, "uncertain")),
    orderBy: [desc(engagementItems.createdAt)], limit: 100,
    columns: { id: true, platform: true, platformPostId: true, platformCommentId: true, commenterHandle: true, createdAt: true },
  });
}

export async function resolveUncertainPrivateReply(id: string) {
  const { requireRole } = await import("@/lib/auth");
  const { db } = await import("@/lib/db");
  const { engagementItems } = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const tenantId = await requireRole(["owner", "admin"]);
  const [resolved] = await db.update(engagementItems).set({ dmDispatchStatus: "skipped", dmDispatchError: "Reviewed by workspace operator; no automatic resend.", dmDispatchLeaseExpiresAt: null })
    .where(and(eq(engagementItems.id, id), eq(engagementItems.tenantId, tenantId), eq(engagementItems.dmDispatchStatus, "uncertain")))
    .returning({ id: engagementItems.id });
  if (!resolved) throw new Error("This reply is no longer awaiting review.");
  return { ok: true };
}
