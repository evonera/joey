'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { assets, tenants } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateUploadUrl, deleteObject, buildPublicUrl, headObject, assertAllowedUpload, R2_MAX_ASSET_BYTES } from "@/lib/storage";
import { queryAssets } from "@/lib/assets";
import { cancelR2Cleanup, enqueueR2Cleanup } from "@/lib/storage-cleanup";

export async function requestUploadUrl(filename: string, mimeType: string) {
  const tenantId = await getActiveTenantId();
  const result = await generateUploadUrl(filename, mimeType, tenantId);
  return result;
}

export async function registerAsset(data: {
  filename: string;
  key: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  tags?: string[];
  altText?: string;
}) {
  const tenantId = await getActiveTenantId();

  if (!data.key.startsWith(tenantId + "/") || data.key.includes("..")) {
    throw new Error("Invalid asset key: namespace mismatch");
  }
  if (!data.filename || data.filename.length > 255) {
    throw new Error("Invalid filename.");
  }
  if (!Number.isSafeInteger(data.size) || data.size <= 0 || data.size > R2_MAX_ASSET_BYTES) {
    throw new Error("Invalid asset size.");
  }
  // Extension and MIME must agree (R2-only allowlist); throws otherwise.
  assertAllowedUpload(data.filename, data.mimeType);

  // Verify the object was actually uploaded before recording it: prevents
  // phantom rows, quota lies from client-declared sizes, and hijack of
  // flow-run custom keys.
  let head: Awaited<ReturnType<typeof headObject>>;
  try {
    head = await headObject(data.key);
  } catch {
    throw new Error("Uploaded object not found. Complete the upload before registering.");
  }
  const actualSize = Number(head.ContentLength ?? NaN);
  if (!Number.isSafeInteger(actualSize) || actualSize !== data.size) {
    throw new Error("Asset size does not match the uploaded object.");
  }
  if (head.ContentType && head.ContentType !== data.mimeType) {
    throw new Error("Asset MIME type does not match the uploaded object.");
  }

  const [asset] = await db.insert(assets).values({
    tenantId,
    filename: data.filename,
    key: data.key,
    mimeType: data.mimeType,
    size: data.size,
    publicUrl: buildPublicUrl(data.key),
    width: data.width ?? null,
    height: data.height ?? null,
    tags: data.tags ?? [],
    altText: data.altText ?? null,
  }).returning();

  return { asset };
}

export async function listAssets(opts?: {
  tags?: string[];
  search?: string;
  mimeType?: string;
  limit?: number;
  offset?: number;
}) {
  const tenantId = await getActiveTenantId();
  const rows = await queryAssets(tenantId, opts);
  return { assets: rows };
}

export async function deleteAsset(id: string) {
  const tenantId = await getActiveTenantId();

  const asset = await db.query.assets.findFirst({
    where: and(eq(assets.id, id), eq(assets.tenantId, tenantId)),
  });

  if (!asset) throw new Error("Asset not found");

  // Durable intent first (idempotent): a crash between the DB delete and the
  // R2 delete still leaves a cleanup task instead of an orphaned object.
  await enqueueR2Cleanup(tenantId, asset.key, "asset deleted from database");

  await db.delete(assets).where(and(eq(assets.id, id), eq(assets.tenantId, tenantId)));

  try {
    await deleteObject(asset.key);
    await cancelR2Cleanup(asset.key);
  } catch (err) {
    console.error(`[assets] Failed to delete R2 object ${asset.key}:`, err);
  }

  return { success: true };
}

export async function updateAssetTags(id: string, tags: string[]) {
  const tenantId = await getActiveTenantId();

  const [asset] = await db.update(assets)
    .set({ tags })
    .where(and(eq(assets.id, id), eq(assets.tenantId, tenantId)))
    .returning();

  if (!asset) throw new Error("Asset not found");
  return { asset };
}
