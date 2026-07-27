'use server';

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { apiKeys, tenants, socialAccounts, socialEntities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import Zernio from "@zernio/node";

export async function getZernioClient() {
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

    const key = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.tenantId, tenant.id)
    });

    if (!key || !key.encryptedKey) {
        throw new Error("No API key configured");
    }

    const apiKey = decrypt(key.encryptedKey);
    return { zernio: new Zernio({ apiKey }), tenantId: tenant.id };
}

export async function generateConnectUrl(platform: string) {
    try {
        const { zernio } = await getZernioClient();
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        
        const response = await zernio.connect.getConnectUrl({
            query: {
                platform,
                redirectUri: `${appUrl}/callback`,
            }
        });

        return { url: response.data.url };
    } catch (error: any) {
        console.error("Failed to generate connect URL:", error);
        return { error: "Failed to connect to platform" };
    }
}

export async function handleZernioCallback(searchParams: Record<string, string>) {
    try {
        const { zernio, tenantId } = await getZernioClient();
        const platform = searchParams.platform;
        const connected = searchParams.connected;
        const step = searchParams.step;
        const errorParam = searchParams.error;

        if (errorParam) {
            return { error: errorParam };
        }

        // Simple connection success
        if (connected) {
            // Ideally Zernio auto-links to the workspace. We just need to sync accounts.
            await syncConnectedAccounts();
            return { success: true, platform: connected };
        }

        // Sub-entity selection required (Facebook Pages, LinkedIn Orgs, etc)
        if (step && platform) {
            const tempToken = searchParams.tempToken || "";
            const connectToken = searchParams.connect_token || "";
            const pendingDataToken = searchParams.pendingDataToken || "";
            const userProfile = searchParams.userProfile || "";
            
            let entities: any[] = [];
            
            if (platform === "facebook" && step === "select_page") {
                const { data } = await zernio.connect.listFacebookPages({
                    headers: { "X-Connect-Token": connectToken },
                });
                entities = data.pages || [];
            } else if (platform === "linkedin" && step === "select_organization") {
                const { data } = await zernio.connect.getPendingOAuthData({
                    query: { token: pendingDataToken },
                });
                entities = data.organizations || [];
            } else if (platform === "pinterest" && step === "select_board") {
                const { data } = await zernio.connect.listPinterestBoardsForSelection({
                    query: { tempToken },
                    headers: { "X-Connect-Token": connectToken },
                });
                entities = data.boards || [];
            }

            return { requiresSelection: true, platform, entities, tokens: { tempToken, userProfile } };
        }

        return { error: "Invalid callback state" };
    } catch (error: any) {
        console.error("Callback handling failed:", error);
        return { error: error.message || "Failed to process callback" };
    }
}

export async function selectEntityAndFinalize(platform: string, entityId: string, tokens: any) {
    try {
        const { zernio } = await getZernioClient();
        
        if (platform === "facebook") {
            await zernio.connect.selectFacebookPage({
                body: { tempToken: tokens.tempToken, userProfile: tokens.userProfile, pageId: entityId }
            });
        } else if (platform === "linkedin") {
            await zernio.connect.selectLinkedInOrganization({
                body: { tempToken: tokens.tempToken, userProfile: tokens.userProfile, organizationId: entityId }
            });
        } else if (platform === "pinterest") {
            await zernio.connect.selectPinterestBoard({
                body: { tempToken: tokens.tempToken, userProfile: tokens.userProfile, boardId: entityId }
            });
        }
        
        await syncConnectedAccounts();
        return { success: true };
    } catch (error: any) {
        console.error("Entity selection failed:", error);
        return { error: error.message || "Failed to finalize connection" };
    }
}

export async function syncConnectedAccounts() {
    try {
        const { zernio, tenantId } = await getZernioClient();
        const { data } = await zernio.accounts.listAccounts();
        
        if (!data || !data.accounts) return { success: true };

        // Simple sync strategy: wipe existing and rewrite (or use upsert logic)
        await db.delete(socialAccounts).where(eq(socialAccounts.tenantId, tenantId));
        
        for (const account of data.accounts) {
            await db.insert(socialAccounts).values({
                tenantId,
                platform: account.platform,
                platformAccountId: account.id,
                accountName: account.username || account.name || 'Unknown',
                avatarUrl: account.picture || null,
                isActive: true,
            });
        }
        return { success: true, count: data.accounts.length };
    } catch (error: any) {
        console.error("Failed to sync accounts:", error);
        return { error: "Failed to sync accounts from Zernio" };
    }
}

export async function getConnectedAccounts() {
    try {
        const { tenantId } = await getZernioClient();
        const accounts = await db.query.socialAccounts.findMany({
            where: eq(socialAccounts.tenantId, tenantId)
        });
        return { accounts };
    } catch (error: any) {
        return { error: "Failed to fetch accounts" };
    }
}
