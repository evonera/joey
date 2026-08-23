'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicApiTokens } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

export async function createPublicApiToken(name: string, scopes: string[] = ["read", "write"]) {
    try {
        const tenantId = await getActiveTenantId();
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        await db.insert(publicApiTokens).values({
            tenantId,
            name,
            tokenHash,
            scopes,
        });

        // Return token only once
        return { success: true, token };
    } catch (error: any) {
        console.error("Failed to create API token:", error);
        return { error: "Failed to create API token" };
    }
}

export async function listPublicApiTokens() {
    try {
        const tenantId = await getActiveTenantId();
        
        const data = await db.query.publicApiTokens.findMany({
            where: eq(publicApiTokens.tenantId, tenantId),
            columns: {
                id: true,
                name: true,
                scopes: true,
                lastUsedAt: true,
                createdAt: true
            },
            orderBy: [desc(publicApiTokens.createdAt)]
        });

        return { tokens: data };
    } catch (error: any) {
        console.error("Failed to list API tokens:", error);
        return { error: "Failed to list API tokens" };
    }
}

export async function revokePublicApiToken(tokenId: string) {
    try {
        const tenantId = await getActiveTenantId();

        await db.delete(publicApiTokens)
            .where(and(eq(publicApiTokens.id, tokenId), eq(publicApiTokens.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to revoke API token:", error);
        return { error: "Failed to revoke API token" };
    }
}
