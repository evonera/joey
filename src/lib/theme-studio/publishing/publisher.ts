import { and, eq, inArray, lt, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  contentPackages,
  socialAccounts,
  themeContentFormats,
  themePages,
} from "@/lib/db/schema";
import { getZernioClientForTenant } from "@/lib/publisher-core";

import { adaptPackageForPlatform } from "./variant-adapter";

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
  await db
    .update(contentPackages)
    .set({ status: "failed", error: message, updatedAt: new Date() })
    .where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)));

  return { success: false, status: "failed", error: message };
}

/**
 * Publishes an approved Theme Studio package through the tenant's Zernio
 * connection. The package ID is also used as Zernio's idempotency key so a
 * retry cannot create a second logical post.
 */
export async function publishContentPackage(
  packageId: string,
  tenantId: string,
): Promise<PublishContentPackageResult> {
  const pkg = await db.query.contentPackages.findFirst({
    where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)),
  });
  if (!pkg) {
    return { success: false, status: "failed", error: "Content package not found" };
  }

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
  const account = (priorAccountId ? accounts.find((candidate) => candidate.id === priorAccountId) : undefined)
    ?? accounts.find(
      (candidate) => selectedAccountIds.includes(candidate.id)
        && candidate.isActive !== false
        && zernioPlatform(candidate.platform) === targetPlatform,
    );
  if (!account) {
    return failPackage(
      packageId,
      tenantId,
      `No selected, active ${format.platform} account is connected`,
    );
  }

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
  const stalePublishingCutoff = new Date(claimTime.getTime() - 10 * 60_000);
  const claimed = await db
    .update(contentPackages)
    .set({
      status: "publishing",
      error: null,
      metrics: {
        ...priorMetrics,
        publishAccountId: account.id,
        publishRequestId: pkg.id,
        publishAttemptAt: claimTime.toISOString(),
      },
      updatedAt: claimTime,
    })
    .where(
      and(
        eq(contentPackages.id, packageId),
        eq(contentPackages.tenantId, tenantId),
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
        platforms: [{
          platform: targetPlatform,
          accountId: account.platformAccountId,
          customContent: variant.adaptedCaption,
        }],
        hashtags: variant.adaptedHashtags,
        ...(pkg.scheduledFor
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

    const published = post.status === "published";
    const platformResult = post.platforms?.find(
      (candidate: { platform?: string; platformPostUrl?: string }) => candidate.platform === targetPlatform,
    );
    await db
      .update(contentPackages)
      .set({
        status: published ? "published" : "publishing",
        publishedPostId: platformResult?.platformPostId ?? post._id,
        publishedAt: published ? new Date() : null,
        metrics: {
          ...priorMetrics,
          publishAccountId: account.id,
          publishRequestId: pkg.id,
          zernioPostId: post._id,
          ...(platformResult?.platformPostUrl ? { publishedUrl: platformResult.platformPostUrl } : {}),
        },
        error: null,
        updatedAt: new Date(),
      })
      .where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)));

    return {
      success: true,
      status: published ? "published" : "publishing",
      zernioPostId: post._id,
      publishedUrl: platformResult?.platformPostUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zernio publishing failed";
    return failPackage(packageId, tenantId, message);
  }
}
