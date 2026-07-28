'use server';

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { apiKeys, tenants } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto";

async function getTenantId() {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
        throw new Error("Unauthorized");
    }

    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.ownerId, session.user.id)
    });

    if (!tenant) {
        throw new Error("No tenant found");
    }

    return tenant.id;
}

export async function getApiKey(provider: string) {
    try {
        const tenantId = await getTenantId();

        const key = await db.query.apiKeys.findFirst({
            where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, provider))
        });

        if (!key) return null;

        return {
            id: key.id,
            provider: key.provider,
            status: key.status
        };
    } catch (error: any) {
        console.error("Failed to get API key:", error);
        return null;
    }
}

export async function saveApiKey(provider: string, key: string) {
    try {
        const tenantId = await getTenantId();

        const encrypted = encrypt(key);

        const existing = await db.query.apiKeys.findFirst({
            where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, provider))
        });

        if (existing) {
            await db.update(apiKeys)
                .set({ encryptedKey: encrypted, status: 'active' })
                .where(eq(apiKeys.id, existing.id));
        } else {
            await db.insert(apiKeys).values({
                tenantId,
                provider,
                encryptedKey: encrypted,
                status: 'active'
            });
        }

        return { success: true };
    } catch (error: any) {
        console.error("Failed to save API key:", error);
        return { error: "Failed to save API key" };
    }
}

export async function deleteApiKey(provider: string) {
    try {
        const tenantId = await getTenantId();

        await db.delete(apiKeys)
            .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, provider)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete API key:", error);
        return { error: "Failed to delete API key" };
    }
}
