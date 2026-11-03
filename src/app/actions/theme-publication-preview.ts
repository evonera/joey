'use server';

import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { lockedThemePreview } from "@/lib/theme-studio/publishing/locked-preview";
import { publishContentPackage } from "@/lib/theme-studio/publishing/publisher";
import { contentPackages } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { reconcileThemePackagePostEvent } from "@/lib/theme-studio/publishing/reconcile-post-event";

export async function prepareThemePublication(packageId: string, publishEarly: boolean) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    z.string().min(1).max(128).parse(packageId);
    z.boolean().parse(publishEarly);
    return await db.transaction(async tx => {
      const preview = await lockedThemePreview(tx, tenantId, packageId, publishEarly);
      const metrics = preview.pkg.metrics as Record<string, unknown> | null;
      if (!["approved", "failed"].includes(preview.pkg.status) || metrics?.zernioPostId) throw new Error("This package is not available for a new publication.");
      if (metrics?.publishAttemptAt && Date.now() - Date.parse(String(metrics.publishAttemptAt)) > 240_000) throw new Error("Check Zernio before retrying this interrupted publication.");
      return { preview: { payload: preview.payload, accounts: preview.identity, fingerprint: preview.fingerprint, publishEarly } };
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Could not prepare publication." }; }
}

export async function reconcileThemePublication(packageId: string) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    z.string().min(1).max(128).parse(packageId);
    const pkg = await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
    const metrics = pkg?.metrics as Record<string, unknown> | null;
    if (typeof metrics?.zernioPostId !== "string") return { error: "No provider receipt is recorded. Check Zernio before retrying." };
    await reconcileThemePackagePostEvent({ event: "post.updated", post: { id: metrics.zernioPostId, metadata: { themePackageId: packageId } } }, tenantId);
    return { success: true };
  } catch { return { error: "Could not check the existing publication. Try again later." }; }
}

export async function publishConfirmedThemePackage(packageId: string, publishEarly: boolean, fingerprint: string) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    z.string().min(1).max(128).parse(packageId);
    z.boolean().parse(publishEarly);
    z.string().regex(/^[a-f0-9]{64}$/).parse(fingerprint);
    return await publishContentPackage(packageId, tenantId, publishEarly, fingerprint);
  } catch { return { success: false, status: "failed" as const, error: "Could not publish. Refresh and review the package again." }; }
}
