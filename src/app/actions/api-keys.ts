'use server';

import { auth, getActiveTenantId, requireRole } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { apiKeys, tenants } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt, maskKey } from "@/lib/crypto";

const ALLOWED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'fal',
  'openrouter',
  'supadata',
  'apify',
  'exa',
  'tavily'
]);

export async function getApiKey(provider: string) {
    try {
        const cleanProvider = provider?.trim().toLowerCase();
        if (!ALLOWED_PROVIDERS.has(cleanProvider)) {
            return null;
        }
        const tenantId = await getActiveTenantId();

        const key = await db.query.apiKeys.findFirst({
            where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, cleanProvider))
        });

        if (!key) return null;

        let maskedKey = "••••••••";
        try {
            const raw = decrypt(key.encryptedKey, tenantId);
            maskedKey = maskKey(raw);
        } catch {
            // Keep generic mask if decryption fails
        }

        return {
            id: key.id,
            provider: key.provider,
            status: key.status,
            maskedKey,
        };
    } catch (error: any) {
        console.error("Failed to get API key metadata:", error?.message);
        return null;
    }
}

export async function saveApiKey(provider: string, key: string) {
    try {
        const cleanProvider = provider?.trim().toLowerCase();
        if (!ALLOWED_PROVIDERS.has(cleanProvider)) {
            return { error: `Unsupported provider: ${cleanProvider}` };
        }

        const cleanKey = key?.trim();
        if (!cleanKey || cleanKey.length < 8) {
            return { error: "API key is too short or invalid" };
        }

        if (cleanKey.includes("...") || cleanKey.includes("••••")) {
            return { error: "Please enter the full API key" };
        }

        if (cleanProvider === "google" && !cleanKey.startsWith("AIzaSy") && cleanKey.length < 20) {
            return { error: "Invalid Google API key. Expected Gemini key starting with AIzaSy..." };
        }

        const tenantId = await requireRole(["owner", "admin"]);
        const encrypted = encrypt(cleanKey, tenantId);

        const existing = await db.query.apiKeys.findFirst({
            where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, cleanProvider))
        });

        if (existing) {
            await db.update(apiKeys)
                .set({ encryptedKey: encrypted, status: 'active' })
                .where(eq(apiKeys.id, existing.id));
        } else {
            await db.insert(apiKeys).values({
                tenantId,
                provider: cleanProvider,
                encryptedKey: encrypted,
                status: 'active'
            });
        }

        return { success: true };
    } catch (error: any) {
        console.error("Failed to save API key:", error?.message);
        return { error: error?.message || "Failed to save API key" };
    }
}

export async function deleteApiKey(provider: string) {
    try {
        const tenantId = await requireRole(["owner", "admin"]);

        await db.delete(apiKeys)
            .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, provider)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete API key:", error);
        return { error: error?.message || "Failed to delete API key" };
    }
}
