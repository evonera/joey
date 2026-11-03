"use server";

import { getActiveTenantId, requireRole } from "@/lib/auth";
import { getOperationalHealth } from "@/lib/operations";
import { db } from "@/lib/db";
import { engagementItems } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

export async function getTenantOperationalHealth() {
  const tenantId = await getActiveTenantId();
  return getOperationalHealth(tenantId);
}

export async function listUncertainPrivateReplies() {
  const tenantId = await getActiveTenantId();
  return db.query.engagementItems.findMany({
    where: and(eq(engagementItems.tenantId, tenantId), eq(engagementItems.dmDispatchStatus, "uncertain")),
    orderBy: [desc(engagementItems.createdAt)], limit: 100,
    columns: { id: true, platform: true, platformPostId: true, platformCommentId: true, commenterHandle: true, createdAt: true },
  });
}

export async function resolveUncertainPrivateReply(id: string) {
  const tenantId = await requireRole(["owner", "admin"]);
  const [resolved] = await db.update(engagementItems).set({ dmDispatchStatus: "skipped", dmDispatchError: "Reviewed by workspace operator; no automatic resend.", dmDispatchLeaseExpiresAt: null })
    .where(and(eq(engagementItems.id, id), eq(engagementItems.tenantId, tenantId), eq(engagementItems.dmDispatchStatus, "uncertain")))
    .returning({ id: engagementItems.id });
  if (!resolved) throw new Error("This reply is no longer awaiting review.");
  return { ok: true };
}
