'use server';

import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";
import { db } from "@/lib/db";
import { apiKeys, tenants, socialAccounts, socialEntities } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto";
import Zernio from "@zernio/node";
import crypto from "crypto";

import { getActiveTenantId, requireRole } from "@/lib/auth";

import { getZernioClient } from "@/lib/zernio-session";

import { ensureZernioProfile } from "@/lib/zernio-profile";

export async function generateConnectUrl(platform: string) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    const { assertAccountQuota } = await import("@/lib/billing");
    await assertAccountQuota(tenantId);
    const supported = ["facebook", "instagram", "linkedin", "twitter", "tiktok", "youtube", "threads", "reddit", "pinterest", "bluesky", "googlebusiness", "telegram", "snapchat", "discord", "whatsapp"];
    const canonical = platform === "x" ? "twitter" : platform;
    if (!supported.includes(canonical)) return { error: "This platform is not supported." };
    const { zernio } = await getZernioClient();
    const profileId = await ensureZernioProfile(tenantId, zernio);
    const state = crypto.randomUUID();
    const callback = new URL("/callback", auth.options.baseURL as string);
    callback.searchParams.set("joey_state", state);
    // Zernio owns OAuth state and hosted account selection. Our nonce is
    // preserved in the custom redirect URL and bound to the active workspace.
    const response = await zernio.connect.getConnectUrl({
      path: { platform: canonical },
      query: { profileId, redirect_url: callback.toString() },
    });
    if (response.error || !response.data?.authUrl) return { error: "Zernio could not start the connection. Check your key and plan." };
    (await cookies()).set("zernio_oauth_state", encrypt(JSON.stringify({ state, profileId, platform: canonical }), tenantId), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/",
    });
    return { url: response.data.authUrl as string };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to connect to platform" };
  }
}

export async function handleZernioCallback(params: Record<string, string>) {
  try {
    const tenantId = await requireRole(["owner", "admin"]);
    const cookieStore = await cookies();
    const saved = cookieStore.get("zernio_oauth_state")?.value;
    if (!saved) return { error: "Connection session expired. Start again from Accounts." };
    const pending = JSON.parse(decrypt(saved, tenantId)) as { state: string; profileId: string; platform: string };
    if (!params.joey_state || params.joey_state !== pending.state) return { error: "Invalid connection state. Start again from Accounts." };
    if (params.error) { cookieStore.delete("zernio_oauth_state"); return { error: "The provider could not connect your account. Please try again." }; }
    if (params.profileId !== pending.profileId || params.connected !== pending.platform || !params.accountId) return { error: "The returned account does not match this connection. Start again from Accounts." };
    const result = await syncConnectedAccounts();
    if (result.error) return { error: result.error };
    const account = await db.query.socialAccounts.findFirst({ where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.platformAccountId, params.accountId), eq(socialAccounts.isActive, true)) });
    if (!account) return { error: "The connected account is not yet available. Retry the connection from Accounts." };
    cookieStore.delete("zernio_oauth_state");
    return { success: true, platform: pending.platform };
  } catch { return { error: "Could not verify this workspace connection. Start again from Accounts." }; }
}

export async function syncConnectedAccounts() {
    try {
        const { zernio, tenantId } = await getZernioClient();
        const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { zernioProfileId: true } });
        if (!tenant?.zernioProfileId) return { error: "Connect an account from Accounts to set up this workspace’s Zernio profile." };
        const { data, error } = await zernio.accounts.listAccounts({ query: { profileId: tenant.zernioProfileId } });
        if (error || !Array.isArray(data?.accounts)) return { error: "Zernio account sync failed. Your existing accounts were preserved." };
        if (data.accounts.some((account: { _id?: string }) => !account._id)) return { error: "Zernio returned an account without an ID. Existing accounts were preserved." };

        // Non-destructive upsert to preserve account IDs and prevent cascading deletion of social_entities
        await db.transaction(async (tx) => {
            await tx.execute(sql`SELECT id FROM ${tenants} WHERE id = ${tenantId} FOR UPDATE`);
            const existingAccounts = await tx.query.socialAccounts.findMany({
                where: eq(socialAccounts.tenantId, tenantId),
            });

            const fetchedPlatformAccounts = new Set(
                data.accounts.map((a: any) => `${a.platform}:${a._id}`)
            );

            for (const account of data.accounts) {
                const existing = existingAccounts.find(
                    (ea) => ea.platform === account.platform && ea.platformAccountId === account._id
                );

                if (existing) {
                    await tx
                        .update(socialAccounts)
                        .set({
                            accountName: account.username || account.displayName || 'Unknown',
                            avatarUrl: account.profilePicture || null,
                            isActive: account.isActive === true && account.enabled !== false && !account.needsReconnection,
                        })
                        .where(eq(socialAccounts.id, existing.id));
                } else {
                    await tx.insert(socialAccounts).values({
                        tenantId,
                        platform: account.platform,
                        platformAccountId: account._id,
                        accountName: account.username || account.displayName || 'Unknown',
                        avatarUrl: account.profilePicture || null,
                        isActive: account.isActive === true && account.enabled !== false && !account.needsReconnection,
                    });
                }
            }

            // Deactivate accounts that no longer exist on Zernio without destroying rows or cascade-deleting child entities
            for (const existing of existingAccounts) {
                const accountKey = `${existing.platform}:${existing.platformAccountId}`;
                if (!fetchedPlatformAccounts.has(accountKey) && existing.isActive) {
                    await tx
                        .update(socialAccounts)
                        .set({ isActive: false })
                        .where(eq(socialAccounts.id, existing.id));
                }
            }
        });

        return { success: true, count: data.accounts.length };
    } catch (error: any) {
        console.error("Failed to sync accounts:", error);
        return { error: "Failed to sync accounts from Zernio" };
    }
}

export async function getConnectedAccounts() {
    try {
        const tenantId = await getActiveTenantId();
        const accounts = await db.query.socialAccounts.findMany({
            where: and(
                eq(socialAccounts.tenantId, tenantId),
                eq(socialAccounts.isActive, true)
            )
        });
        return { accounts };
    } catch (error: any) {
        return { error: "Failed to fetch accounts" };
    }
}

export async function disconnectAccount(accountId: string) {
    try {
        const tenantId = await requireRole(["owner", "admin"]);
        const account = await db.query.socialAccounts.findFirst({ where: and(eq(socialAccounts.id, accountId), eq(socialAccounts.tenantId, tenantId)) });
        if (!account) return { error: "Account not found" };
        const { zernio } = await getZernioClient();
        const response = await zernio.accounts.deleteAccount({ path: { accountId: account.platformAccountId } });
        if (response.error) return { error: "Zernio could not disconnect the account. Please try again." };
        await db.update(socialAccounts).set({ isActive: false }).where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.tenantId, tenantId)));

        return { success: true };
    } catch (error: any) {
        console.error("Failed to disconnect account:", error);
        return { error: error?.message || "Failed to disconnect account" };
    }
}
