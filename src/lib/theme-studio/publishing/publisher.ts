import { and, eq, inArray, lt, or, sql, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  contentPackages,
  socialAccounts,
  themeContentFormats,
  themePages,
} from "@/lib/db/schema";
import { draftStatusFromZernio, getZernioClientForTenant } from "@/lib/publisher-core";

import { adaptPackageForPlatform } from "./variant-adapter";
import { reconcileThemePackagePostEvent } from "./reconcile-post-event";
import { scoutFactReviewRequired } from "@/lib/scouts/fact-review";
import { matchingPackageAccounts, packageDestinationIds, zernioPlatform } from "./destinations";
import { buildThemePublicationPayload } from "./payload";

export interface PublishContentPackageResult {
  success: boolean;
  status: "publishing" | "published" | "failed";
  zernioPostId?: string;
  publishedUrl?: string;
  error?: string;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function failPackage(
  packageId: string,
  tenantId: string,
  message: string,
): Promise<PublishContentPackageResult> {
  const changed = await db
    .update(contentPackages)
    .set({ status: "failed", error: message, updatedAt: new Date() })
    .where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId), ne(contentPackages.status, "published"), sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`))
    .returning({ id: contentPackages.id });
  if (!changed.length) {
    const current = await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
    if (current) {
      const status = draftStatusFromZernio(current.status);
      return { success: status !== "failed", status, ...(status === "failed" ? { error: current.error || message } : {}) };
    }
  }

  return { success: false, status: "failed", error: message };
}

/**
 * Publishes an approved Theme Studio package through the tenant's Zernio
 * connection. The package ID is also used as Zernio's idempotency key so a
 * retry within the provider window refers to the same logical post.
 */
export async function publishContentPackage(
  packageId: string,
  tenantId: string,
  publishEarly = false,
): Promise<PublishContentPackageResult> {
  const pkg = await db.query.contentPackages.findFirst({
    where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)),
  });
  if (!pkg) {
    return { success: false, status: "failed", error: "Content package not found" };
  }

  const savedMetrics = pkg.metrics as Record<string, unknown> | null;
  if (typeof savedMetrics?.zernioPostId === "string") {
    try {
      await reconcileThemePackagePostEvent({ event: "post.updated", post: { id: savedMetrics.zernioPostId, metadata: { themePackageId: packageId } } }, tenantId);
    } catch { return { success: false, status: "failed", error: "Could not confirm the existing post. Try again later." }; }
    const current = await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
    const status = draftStatusFromZernio(current?.status);
    return { success: status !== "failed", status, zernioPostId: savedMetrics.zernioPostId, ...(status === "failed" ? { error: "Review the existing post in Zernio before retrying." } : {}) };
  }
  if (savedMetrics?.publishAttemptAt && Date.now() - Date.parse(String(savedMetrics.publishAttemptAt)) > 4 * 60_000) {
    return failPackage(packageId, tenantId, "Publication was interrupted beyond the deduplication window. Check Zernio before creating another package.");
  }
  if (scoutFactReviewRequired(pkg.provenance)) {
    return { success: false, status: "failed", error: "Source claims need human fact review in Theme Studio before publication." };
  }

  try {
    const { assertThemeRenderCurrent } = await import("@/lib/media-engine/theme-adapter");
    await assertThemeRenderCurrent(tenantId, packageId);
  } catch (error) { return { success: false, status: "failed", error: error instanceof Error ? error.message : "Render not ready" }; }

  const [page, format] = await Promise.all([
    db.query.themePages.findFirst({
      where: and(eq(themePages.id, pkg.themePageId), eq(themePages.tenantId, tenantId)),
    }),
    db.query.themeContentFormats.findFirst({
      where: and(eq(themeContentFormats.id, pkg.formatId), eq(themeContentFormats.tenantId, tenantId)),
    }),
  ]);

  if (!page || !format) {
    return failPackage(packageId, tenantId, "Theme page or content format not found");
  }

  const priorMetrics = pkg.metrics && typeof pkg.metrics === "object"
    ? pkg.metrics as Record<string, unknown>
    : {};
  const { selectedAccountIds, priorAccountId, lookupIds } = packageDestinationIds(pkg.provenance, page.connectedAccounts, priorMetrics);
  if (selectedAccountIds.length === 0 && !priorAccountId) {
    return failPackage(packageId, tenantId, "Select a connected social account before publishing");
  }

  const accounts = await db.query.socialAccounts.findMany({
    where: and(
      eq(socialAccounts.tenantId, tenantId),
      inArray(socialAccounts.id, lookupIds),
    ),
  });
  const targetPlatform = zernioPlatform(format.platform);
  const matchingAccounts = matchingPackageAccounts(accounts, format.platform, selectedAccountIds, priorAccountId);
  if (matchingAccounts.length === 0) {
    return failPackage(
      packageId,
      tenantId,
      `No selected, active ${format.platform} account is connected`,
    );
  }
  const primaryAccount = matchingAccounts[0];

  const variant = adaptPackageForPlatform(
    pkg,
    format.platform as "instagram" | "tiktok" | "x",
    format.mediaType as "image" | "carousel" | "video",
  );
  if (variant.mediaUrls.length === 0 || variant.mediaUrls.some((url) => !isPublicHttpsUrl(url))) {
    return failPackage(packageId, tenantId, "Publishing requires publicly reachable HTTPS media");
  }
  if (format.platform === "tiktok" && variant.mediaType !== "video") {
    return failPackage(packageId, tenantId, "TikTok publishing requires a rendered video asset");
  }

  const claimTime = new Date();
  const stalePublishingCutoff = new Date(claimTime.getTime() - 2 * 60_000);
  const claimed = await db
    .update(contentPackages)
    .set({
      status: "publishing",
      error: null,
      metrics: {
        ...priorMetrics,
        publishAccountId: primaryAccount.id,
        publishAccountIds: matchingAccounts.map((a) => a.id),
        publishRequestId: pkg.id,
        publishAttemptAt: priorMetrics.publishAttemptAt || claimTime.toISOString(),
      },
      updatedAt: claimTime,
    })
    .where(
      and(
        eq(contentPackages.id, packageId),
        eq(contentPackages.tenantId, tenantId),
        eq(contentPackages.updatedAt, pkg.updatedAt),
        or(
          inArray(contentPackages.status, ["approved", "failed"]),
          and(eq(contentPackages.status, "publishing"), lt(contentPackages.updatedAt, stalePublishingCutoff)),
        ),
      ),
    )
    .returning({ id: contentPackages.id });
  if (claimed.length === 0) {
    return {
      success: false,
      status: "failed",
      error: "Package is not approved or is already being published",
    };
  }

  try {
    const { zernio } = await getZernioClientForTenant(tenantId);
    const response = await zernio.posts.createPost({
      headers: { "x-request-id": pkg.id },
      body: buildThemePublicationPayload(pkg, format, matchingAccounts, publishEarly, new Date()),
    });

    const responseData = response.data as (typeof response.data & { existingPost?: NonNullable<typeof response.data>["post"] }) | undefined;
    let post = responseData?.post ?? responseData?.existingPost;
    const duplicatePostId = response.error && typeof response.error === "object" && "details" in response.error
      ? (response.error as { details?: { existingPostId?: string } }).details?.existingPostId
      : undefined;
    if (!post && duplicatePostId) {
      const existing = await zernio.posts.getPost({ path: { postId: duplicatePostId } });
      post = existing.data?.post;
    }
    if (response.error && !post) {
      const message = typeof response.error === "object" && response.error && "error" in response.error
        ? String(response.error.error)
        : "Zernio rejected the post";
      throw new Error(message);
    }
    if (!post?._id) {
      throw new Error("Zernio did not return a post identifier");
    }

    const platformResult = post.platforms?.find(
      (candidate: { platform?: string; platformPostUrl?: string }) => candidate.platform === targetPlatform,
    );
    const status = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM ${contentPackages} WHERE id = ${packageId} AND tenant_id = ${tenantId} FOR UPDATE`);
      const current = await tx.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
      const currentMetrics = (current?.metrics || {}) as Record<string, unknown>;
      // A webhook may have already reconciled a newer canonical response.
      if (currentMetrics.zernioPostId) return draftStatusFromZernio(current?.status);
      const status = draftStatusFromZernio(post.status);
      await tx
      .update(contentPackages)
      .set({
        status,
        publishedPostId: platformResult?.platformPostId ?? post._id,
        publishedAt: status === "published" ? new Date() : null,
        metrics: {
          ...priorMetrics,
          ...currentMetrics,
          publishAccountId: primaryAccount.id,
          publishAccountIds: matchingAccounts.map((a) => a.id),
          publishRequestId: pkg.id,
          zernioPostId: post._id,
          ...(platformResult?.platformPostUrl ? { publishedUrl: platformResult.platformPostUrl } : {}),
        },
        error: status === "failed" ? "Zernio reported a publishing failure." : null,
        updatedAt: new Date(),
      })
      .where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)));
      return status;
    });

    return {
      success: status !== "failed",
      ...(status === "failed" ? { error: "Zernio reported a publishing failure." } : {}),
      status,
      zernioPostId: post._id,
      publishedUrl: platformResult?.platformPostUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zernio publishing failed";
    return failPackage(packageId, tenantId, message);
  }
}
