'use server';

import { db } from "@/lib/db";
import { publicApiTokens } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import crypto from "crypto";
import { getActiveTenantId, requireRole } from "@/lib/auth";

const VALID_SCOPES = ["read", "write", "approve"] as const;
export type ApiScope = (typeof VALID_SCOPES)[number];

export type PublicApiToken = {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export async function listApiTokens(): Promise<{ tokens: PublicApiToken[] }> {
  const tenantId = await getActiveTenantId();
  const tokens = await db.query.publicApiTokens.findMany({
    where: eq(publicApiTokens.tenantId, tenantId),
    orderBy: [desc(publicApiTokens.createdAt)],
    columns: {
      id: true,
      name: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  return { tokens };
}

/**
 * Creates a new API token for the active workspace. The plaintext token is
 * returned exactly once — only its SHA-256 hash is stored, so it cannot be
 * retrieved later.
 */
export async function createApiToken(
  name: string,
  scopes: string[],
): Promise<{ token?: PublicApiToken & { secret: string }; error?: string }> {
  let tenantId: string;
  try {
    tenantId = await requireRole(["owner", "admin"]);
  } catch (err: any) {
    return { error: err.message || "Only owners and admins can create API tokens." };
  }

  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 100) {
    return { error: "Token name is required (max 100 characters)." };
  }

  const validScopes = scopes.filter((s): s is ApiScope =>
    (VALID_SCOPES as readonly string[]).includes(s),
  );
  if (validScopes.length === 0) {
    return { error: "Select at least one scope." };
  }
  if (!validScopes.includes("read")) {
    // write/approve imply read access to the same resources
    return { error: "The 'read' scope must be included." };
  }

  const secret = `joe_${crypto.randomBytes(32).toString("base64url")}`;
  const tokenHash = crypto.createHash("sha256").update(secret).digest("hex");

  const [row] = await db
    .insert(publicApiTokens)
    .values({ tenantId, name: trimmedName, tokenHash, scopes: validScopes })
    .returning();

  const token: PublicApiToken = {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };

  return { token: { ...token, secret } };
}

export async function revokeApiToken(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  let tenantId: string;
  try {
    tenantId = await requireRole(["owner", "admin"]);
  } catch (err: any) {
    return { error: err.message || "Only owners and admins can revoke API tokens." };
  }

  const deleted = await db
    .delete(publicApiTokens)
    .where(and(eq(publicApiTokens.id, id), eq(publicApiTokens.tenantId, tenantId)))
    .returning();

  if (deleted.length === 0) {
    return { error: "Token not found" };
  }
  return { success: true };
}
