import { db } from "@/lib/db";
import { contentPackages, themePages, themeContentFormats } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { adaptPackageForPlatform } from "./variant-adapter";
import { InstagramProvider } from "./providers/instagram-provider";
import { TikTokProvider } from "./providers/tiktok-provider";
import { XProvider } from "./providers/x-provider";
import type { IPlatformProvider } from "./platform-provider";

export interface PublishPackageResult {
  packageId: string;
  status: "published" | "failed";
  publishedPostId?: string;
  publishedUrl?: string;
  error?: string;
}

const PROVIDERS: Record<string, IPlatformProvider> = {
  instagram: new InstagramProvider(),
  tiktok: new TikTokProvider(),
  x: new XProvider(),
  twitter: new XProvider(),
};

/**
 * Executes the 3-step async publishing pipeline for a content package.
 */
export async function publishContentPackage(
  packageId: string,
  credentials?: { accountId: string; accessToken: string }
): Promise<PublishPackageResult> {
  const pkg = await db.query.contentPackages.findFirst({
    where: eq(contentPackages.id, packageId),
  });
  if (!pkg) throw new Error("Content package not found");

  const format = await db.query.themeContentFormats.findFirst({
    where: eq(themeContentFormats.id, pkg.formatId),
  });

  const platform = (format?.platform || "instagram").toLowerCase();
  const provider = PROVIDERS[platform] || PROVIDERS.instagram;

  const variant = adaptPackageForPlatform(
    pkg,
    platform as any,
    (format?.mediaType as any) || "image"
  );

  // Validate limits
  const validation = provider.validateContent(
    variant.adaptedCaption,
    variant.mediaUrls,
    variant.mediaType
  );

  if (!validation.valid) {
    const errorMsg = `Platform validation failed: ${validation.errors.join("; ")}`;
    await db
      .update(contentPackages)
      .set({ status: "failed", error: errorMsg, updatedAt: new Date() })
      .where(eq(contentPackages.id, packageId));

    return {
      packageId,
      status: "failed",
      error: errorMsg,
    };
  }

  // Set status to publishing
  await db
    .update(contentPackages)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(eq(contentPackages.id, packageId));

  const authAccount = {
    accountId: credentials?.accountId || "mock_account_1",
    platform,
    accessToken: credentials?.accessToken || "mock_token",
  };

  try {
    // Step 1: Create Container
    const container = await provider.createMediaContainer(
      authAccount,
      variant.mediaUrls,
      variant.mediaType
    );
    if (container.status === "ERROR") {
      throw new Error(container.error || "Failed to create media container");
    }

    // Step 2: Poll Container Status
    const polled = await provider.pollContainerStatus(authAccount, container.containerId);
    if (polled.status === "ERROR") {
      throw new Error(polled.errorMessage || "Media processing failed on platform");
    }

    // Step 3: Finalize Publish
    const final = await provider.finalizePublish(
      authAccount,
      container.containerId,
      variant.adaptedCaption
    );
    if (!final.success) {
      throw new Error(final.error || "Failed to finalize post publication");
    }

    // Update package record
    await db
      .update(contentPackages)
      .set({
        status: "published",
        publishedAt: new Date(),
        publishedPostId: final.publishedPostId,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(contentPackages.id, packageId));

    return {
      packageId,
      status: "published",
      publishedPostId: final.publishedPostId,
      publishedUrl: final.publishedUrl,
    };
  } catch (err: any) {
    const errorMsg = err.message || "Publishing failed";
    await db
      .update(contentPackages)
      .set({ status: "failed", error: errorMsg, updatedAt: new Date() })
      .where(eq(contentPackages.id, packageId));

    return {
      packageId,
      status: "failed",
      error: errorMsg,
    };
  }
}
