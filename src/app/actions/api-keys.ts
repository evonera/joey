'use server';

import { auth, getActiveTenantId, requireRole } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { apiKeys, socialAccounts, tenants } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
  'tavily',
  'zernio'
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

        // Zernio credentials must be verified with the provider before they are
        // stored. The Settings UI and onboarding route these through
        // /api/validate-key instead of this generic BYOK action.
        if (cleanProvider === "zernio") {
            return { error: "Zernio keys must be saved through the verified Zernio connection form." };
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
        const cleanProvider = provider?.trim().toLowerCase();
        if (!ALLOWED_PROVIDERS.has(cleanProvider)) {
            return { error: `Unsupported provider: ${cleanProvider}` };
        }
        const tenantId = await requireRole(["owner", "admin"]);

        if (cleanProvider === "zernio") {
            await db.transaction(async tx => {
                // Keep credential removal, profile invalidation, and account
                // deactivation atomic with concurrent account sync/connect work.
                await tx.execute(sql`SELECT id FROM ${tenants} WHERE id = ${tenantId} FOR UPDATE`);
                await tx.delete(apiKeys)
                    .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, cleanProvider)));
                await tx.update(tenants)
                    .set({ zernioProfileId: null })
                    .where(eq(tenants.id, tenantId));
                await tx.update(socialAccounts)
                    .set({ isActive: false })
                    .where(eq(socialAccounts.tenantId, tenantId));
            });
        } else {
            await db.delete(apiKeys)
                .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, cleanProvider)));
        }

        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete API key:", error);
        return { error: error?.message || "Failed to delete API key" };
    }
}
