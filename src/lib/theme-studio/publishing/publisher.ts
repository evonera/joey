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

export interface PublishContentPackageResult {
  success: boolean;
  status: "publishing" | "published" | "failed";
  zernioPostId?: string;
  publishedUrl?: string;
  error?: string;
}

function zernioPlatform(platform: string): string {
  return platform === "x" ? "twitter" : platform;
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

  const selectedAccountIds = Array.isArray(page.connectedAccounts)
    ? page.connectedAccounts.filter((id): id is string => typeof id === "string")
    : [];
  const priorMetrics = pkg.metrics && typeof pkg.metrics === "object"
    ? pkg.metrics as Record<string, unknown>
    : {};
  const priorAccountId = typeof priorMetrics.publishAccountId === "string"
    ? priorMetrics.publishAccountId
    : undefined;
  if (selectedAccountIds.length === 0 && !priorAccountId) {
    return failPackage(packageId, tenantId, "Select a connected social account before publishing");
  }

  const accounts = await db.query.socialAccounts.findMany({
    where: and(
      eq(socialAccounts.tenantId, tenantId),
      inArray(socialAccounts.id, priorAccountId
        ? [...new Set([...selectedAccountIds, priorAccountId])]
        : selectedAccountIds),
    ),
  });
  const targetPlatform = zernioPlatform(format.platform);
  const eligibleAccounts = (priorAccountId ? accounts.filter((candidate) => candidate.id === priorAccountId && candidate.isActive === true && zernioPlatform(candidate.platform) === targetPlatform) : [])
    .concat(accounts.filter(
      (candidate) => selectedAccountIds.includes(candidate.id)
        && candidate.isActive !== false
        && zernioPlatform(candidate.platform) === targetPlatform,
    ));

  const uniqueAccountsMap = new Map<string, typeof accounts[0]>();
  for (const acc of eligibleAccounts) {
    uniqueAccountsMap.set(acc.id, acc);
  }
  const matchingAccounts = Array.from(uniqueAccountsMap.values());
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
      body: {
        title: pkg.title,
        content: variant.adaptedCaption,
        mediaItems: variant.mediaUrls.map((url) => ({
          type: variant.mediaType === "video" ? "video" as const : "image" as const,
          url,
          altText: variant.mediaType === "video" ? undefined : pkg.title,
        })),
        platforms: matchingAccounts.map((acc) => ({
          platform: zernioPlatform(acc.platform),
          accountId: acc.platformAccountId,
          customContent: adaptPackageForPlatform(
            pkg,
            acc.platform as "instagram" | "tiktok" | "x",
            format.mediaType as "image" | "carousel" | "video",
          ).adaptedCaption,
        })),
        hashtags: variant.adaptedHashtags,
        ...(!publishEarly && pkg.scheduledFor && pkg.scheduledFor > new Date()
          ? { scheduledFor: pkg.scheduledFor.toISOString() }
          : { publishNow: true }),
        metadata: {
          themePageId: pkg.themePageId,
          themePackageId: pkg.id,
        },
      },
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
