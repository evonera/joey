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
import { lockedThemePreview } from "./locked-preview";
import type Zernio from "@zernio/node";

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

function validationFailure(message: string): PublishContentPackageResult {
  return { success: false, status: "failed", error: message };
}

/** Compare the fields used to decide and construct a publication at JS timestamp precision. */
export function packagePublicationSnapshot(observed: typeof contentPackages.$inferSelect) {
  return and(
    eq(contentPackages.status, observed.status),
    sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${observed.updatedAt.toISOString()}::timestamp`,
    eq(contentPackages.themePageId, observed.themePageId), eq(contentPackages.formatId, observed.formatId),
    sql`${contentPackages.templateId} IS NOT DISTINCT FROM ${observed.templateId}`,
    sql`${contentPackages.clusterId} IS NOT DISTINCT FROM ${observed.clusterId}`,
    sql`${contentPackages.title} IS NOT DISTINCT FROM ${observed.title}`,
    sql`${contentPackages.caption} IS NOT DISTINCT FROM ${observed.caption}`,
    sql`to_jsonb(${contentPackages.hashtags}) IS NOT DISTINCT FROM ${observed.hashtags == null ? null : JSON.stringify(observed.hashtags)}::jsonb`,
    sql`date_trunc('milliseconds', ${contentPackages.scheduledFor}) IS NOT DISTINCT FROM ${observed.scheduledFor?.toISOString() ?? null}::timestamp`,
    sql`${contentPackages.metrics} IS NOT DISTINCT FROM ${observed.metrics == null ? null : JSON.stringify(observed.metrics)}::jsonb`,
    sql`${contentPackages.renderedAssetUrls} IS NOT DISTINCT FROM ${observed.renderedAssetUrls == null ? null : JSON.stringify(observed.renderedAssetUrls)}::jsonb`,
    sql`${contentPackages.provenance} IS NOT DISTINCT FROM ${observed.provenance == null ? null : JSON.stringify(observed.provenance)}::jsonb`,
  );
}

export async function failPackage(
  packageId: string,
  tenantId: string,
  message: string,
  observed: typeof contentPackages.$inferSelect,
): Promise<PublishContentPackageResult> {
  const changed = await db
    .update(contentPackages)
    .set({ status: "failed", error: message, updatedAt: new Date() })
    .where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId), ne(contentPackages.status, "published"), packagePublicationSnapshot(observed), sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`))
    .returning({ id: contentPackages.id });
  if (!changed.length) {
    const current = await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
    if (current) {
      const status = draftStatusFromZernio(current.status);
      return { success: status !== "failed", status, ...(status === "failed" ? { error: "Package changed while publishing was being prepared. Refresh and review it." } : {}) };
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
  expectedFingerprint?: string,
  provider?: Zernio,
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
    return failPackage(packageId, tenantId, "Publication was interrupted beyond the deduplication window. Check Zernio before creating another package.", pkg);
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
    return expectedFingerprint ? validationFailure("Theme page or content format not found") : failPackage(packageId, tenantId, "Theme page or content format not found", pkg);
  }

  const priorMetrics = pkg.metrics && typeof pkg.metrics === "object"
    ? pkg.metrics as Record<string, unknown>
    : {};
  const { selectedAccountIds, priorAccountId, lookupIds } = packageDestinationIds(pkg.provenance, page.connectedAccounts, priorMetrics);
  if (selectedAccountIds.length === 0 && !priorAccountId) {
    return validationFailure("Select a connected social account before publishing");
  }

  const accounts = await db.query.socialAccounts.findMany({
    where: and(
      eq(socialAccounts.tenantId, tenantId),
      inArray(socialAccounts.id, lookupIds),
    ),
  });
  let targetPlatform = zernioPlatform(format.platform);
  let matchingAccounts = matchingPackageAccounts(accounts, format.platform, selectedAccountIds, priorAccountId);
  if (matchingAccounts.length === 0) {
    return validationFailure(`No selected, active ${format.platform} account is connected`);
  }
  let primaryAccount = matchingAccounts[0];

  const variant = adaptPackageForPlatform(
    pkg,
    format.platform as "instagram" | "tiktok" | "x",
    format.mediaType as "image" | "carousel" | "video",
  );
  if (variant.mediaUrls.length === 0 || variant.mediaUrls.some((url) => !isPublicHttpsUrl(url))) {
    return expectedFingerprint ? validationFailure("Publishing requires publicly reachable HTTPS media") : failPackage(packageId, tenantId, "Publishing requires publicly reachable HTTPS media", pkg);
  }
  if (format.platform === "tiktok" && variant.mediaType !== "video") {
    return expectedFingerprint ? validationFailure("TikTok publishing requires a rendered video asset") : failPackage(packageId, tenantId, "TikTok publishing requires a rendered video asset", pkg);
  }

  const claimTime = new Date();
  const stalePublishingCutoff = new Date(claimTime.getTime() - 2 * 60_000);
  const applyClaim = (client: Pick<typeof db, "update">) => client
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
        packagePublicationSnapshot(pkg),
        or(
          inArray(contentPackages.status, ["approved", "failed"]),
          and(eq(contentPackages.status, "publishing"), lt(contentPackages.updatedAt, stalePublishingCutoff)),
        ),
      ),
    )
    .returning();
  let confirmedPayload: ReturnType<typeof buildThemePublicationPayload> | undefined;
  let claimed: (typeof contentPackages.$inferSelect)[];
  if (expectedFingerprint) {
    try {
      claimed = await db.transaction(async tx => {
        const current = await lockedThemePreview(tx, tenantId, packageId, publishEarly);
        if (current.fingerprint !== expectedFingerprint) return [];
        const currentMetrics = current.pkg.metrics as Record<string, unknown> | null;
        if (!["approved", "failed"].includes(current.pkg.status) || currentMetrics?.zernioPostId || (currentMetrics?.publishAttemptAt && Date.now() - Date.parse(String(currentMetrics.publishAttemptAt)) > 240_000)) return [];
        matchingAccounts = current.accounts;
        primaryAccount = current.accounts[0];
        targetPlatform = zernioPlatform(current.format.platform);
        confirmedPayload = current.payload;
        return applyClaim(tx);
      });
    } catch {
      return { success: false, status: "failed", error: "Publication details changed or are unavailable. Refresh and review them again." };
    }
  } else claimed = await applyClaim(db);
  if (claimed.length === 0) {
    return {
      success: false,
      status: "failed",
      error: "Package is not approved or is already being published",
    };
  }

  try {
    const zernio = provider ?? (await getZernioClientForTenant(tenantId)).zernio;
    const response = await zernio.posts.createPost({
      headers: { "x-request-id": pkg.id },
      body: confirmedPayload ?? buildThemePublicationPayload(pkg, format, matchingAccounts, publishEarly, new Date()),
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
    return failPackage(packageId, tenantId, message, claimed[0]);
  }
}
