'use server';

import { and, eq, inArray } from "drizzle-orm";

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { contentPackages } from "@/lib/db/schema";
import { publishContentPackage } from "@/lib/theme-studio/publishing/publisher";

export async function reviewThemePackage(
  packageId: string,
  decision: "approve" | "reject",
) {
  const tenantId = await getActiveTenantId();
  const pkg = await db.query.contentPackages.findFirst({
    where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)),
  });
  if (!pkg) return { error: "Content package not found" };
  if (!["pending_review", "rejected"].includes(pkg.status)) {
    return { error: "Only staged or rejected packages can be reviewed" };
  }
  if (decision === "approve") {
    const assets = Array.isArray(pkg.renderedAssetUrls) ? pkg.renderedAssetUrls : [];
    if (assets.length === 0) return { error: "Render the package media before approval" };
  }

  const [updated] = await db.update(contentPackages).set({
    status: decision === "approve" ? "approved" : "rejected",
    error: null,
    updatedAt: new Date(),
  }).where(and(
    eq(contentPackages.id, packageId),
    eq(contentPackages.tenantId, tenantId),
    inArray(contentPackages.status, ["pending_review", "rejected"]),
  )).returning();
  return updated ? { package: updated } : { error: "Package changed while it was being reviewed" };
}

export async function publishThemePackage(packageId: string) {
  const tenantId = await getActiveTenantId();
  return publishContentPackage(packageId, tenantId);
}
