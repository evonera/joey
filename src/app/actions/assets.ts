'use server';

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { assets, tenants } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateUploadUrl, deleteObject, buildPublicUrl } from "@/lib/storage";
import { queryAssets } from "@/lib/assets";

async function getTenantId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.ownerId, session.user.id),
  });
  if (!tenant) throw new Error("No tenant found");
  return tenant.id;
}

export async function requestUploadUrl(filename: string, mimeType: string) {
  const tenantId = await getTenantId();
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
  const tenantId = await getTenantId();

  if (!data.key.startsWith(tenantId + "/")) {
    throw new Error("Invalid asset key: namespace mismatch");
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
  const tenantId = await getTenantId();
  const rows = await queryAssets(tenantId, opts);
  return { assets: rows };
}

export async function deleteAsset(id: string) {
  const tenantId = await getTenantId();

  const asset = await db.query.assets.findFirst({
    where: and(eq(assets.id, id), eq(assets.tenantId, tenantId)),
  });

  if (!asset) throw new Error("Asset not found");

  await db.delete(assets).where(eq(assets.id, id));

  try {
    await deleteObject(asset.key);
  } catch (err) {
    console.error(`[assets] Failed to delete R2 object ${asset.key}:`, err);
  }

  return { success: true };
}

export async function updateAssetTags(id: string, tags: string[]) {
  const tenantId = await getTenantId();

  const [asset] = await db.update(assets)
    .set({ tags })
    .where(and(eq(assets.id, id), eq(assets.tenantId, tenantId)))
    .returning();

  if (!asset) throw new Error("Asset not found");
  return { asset };
}
