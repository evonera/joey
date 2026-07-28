'use server';

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { assets, tenants } from "@/lib/db/schema";
import { eq, and, like, or, sql } from "drizzle-orm";
import { generateUploadUrl, deleteObject } from "@/lib/storage";

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
  publicUrl: string;
  width?: number | null;
  height?: number | null;
  tags?: string[];
  altText?: string;
}) {
  const tenantId = await getTenantId();

  const [asset] = await db.insert(assets).values({
    tenantId,
    filename: data.filename,
    key: data.key,
    mimeType: data.mimeType,
    size: data.size,
    publicUrl: data.publicUrl,
    width: data.width ?? null,
    height: data.height ?? null,
    tags: data.tags ?? [],
    altText: data.altText ?? null,
  }).returning();

  return { asset };
}

export async function queryAssets(tenantId: string, opts?: {
  tags?: string[];
  search?: string;
  mimeType?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [eq(assets.tenantId, tenantId)];

  if (opts?.tags && opts.tags.length > 0) {
    conditions.push(sql`${assets.tags} && ${opts.tags}`);
  }

  if (opts?.search) {
    conditions.push(like(assets.filename, `%${opts.search}%`));
  }

  if (opts?.mimeType) {
    if (opts.mimeType.endsWith("/*")) {
      const prefix = opts.mimeType.slice(0, -2);
      conditions.push(like(assets.mimeType, `${prefix}%`));
    } else {
      conditions.push(eq(assets.mimeType, opts.mimeType));
    }
  }

  const rows = await db.query.assets.findMany({
    where: and(...conditions),
    orderBy: (assets, { desc }) => [desc(assets.createdAt)],
    limit: opts?.limit ?? 50,
    offset: opts?.offset ?? 0,
  });

  return rows;
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

  await deleteObject(asset.key);
  await db.delete(assets).where(eq(assets.id, id));

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
