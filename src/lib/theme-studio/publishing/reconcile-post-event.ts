import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { contentPackages } from "@/lib/db/schema";
import type { ZernioWebhookPayload } from "@/lib/webhooks";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function validDate(value: unknown): Date {
  const parsed = typeof value === "string" ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function reconcileThemePackagePostEvent(
  payload: ZernioWebhookPayload,
  tenantId: string,
): Promise<void> {
  if (!payload.event.startsWith("post.")) return;
  const post = record(payload.post);
  const metadata = record(post.metadata);
  const packageId = text(metadata.themePackageId);
  if (!packageId) return;

  const pkg = await db.query.contentPackages.findFirst({
    where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)),
  });
  if (!pkg) return;

  const platformEvent = record(payload.platform);
  const platforms = Array.isArray(post.platforms)
    ? post.platforms.map(record)
    : [];
  const publishedTarget = platforms.find((target) => text(target.status) === "published");
  const failedTarget = platforms.find((target) => text(target.status) === "failed");
  const platformPostId = text(platformEvent.platformPostId)
    ?? text(publishedTarget?.platformPostId)
    ?? pkg.publishedPostId;
  const publishedUrl = text(platformEvent.publishedUrl)
    ?? text(publishedTarget?.publishedUrl);
  const zernioPostId = text(post.id);
  const published = payload.event === "post.published"
    || payload.event === "post.platform.published"
    || payload.event === "post.tiktok.url_resolved";
  const failed = payload.event === "post.failed"
    || payload.event === "post.partial"
    || payload.event === "post.cancelled"
    || payload.event === "post.platform.failed";
  const error = text(platformEvent.error)
    ?? text(failedTarget?.error)
    ?? (failed ? `Zernio reported ${payload.event}` : undefined);

  await db.update(contentPackages).set({
    ...(published ? { status: "published", publishedAt: validDate(post.publishedAt) } : {}),
    ...(failed ? { status: "failed", error } : {}),
    ...(platformPostId ? { publishedPostId: platformPostId } : {}),
    metrics: {
      ...(pkg.metrics && typeof pkg.metrics === "object" ? pkg.metrics as RecordValue : {}),
      ...(zernioPostId ? { zernioPostId } : {}),
      ...(publishedUrl ? { publishedUrl } : {}),
    },
    updatedAt: new Date(),
  }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)));
}
