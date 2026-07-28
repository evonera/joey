'use server';

import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";
import { db } from "@/lib/db";
import { apiKeys, tenants, socialAccounts, socialEntities } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto";
import Zernio from "@zernio/node";
import crypto from "crypto";

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
        
        // Generate CSRF state
        const state = crypto.randomUUID();
        const cookieStore = await cookies();
        cookieStore.set('zernio_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 10 * 60, // 10 mins
            path: '/'
        });

        const response = await zernio.connect.getConnectUrl({
            query: {
                platform,
                redirectUri: `${appUrl}/callback`,
                state // send state to Zernio if supported, otherwise store locally to verify redirect flow
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
        const state = searchParams.state;

        // Note: Realistically, if Zernio SDK/API supports state parameter passthrough, we'd verify it here.
        // Assuming it does for the sake of CSRF protection:
        const cookieStore = await cookies();
        const storedState = cookieStore.get('zernio_oauth_state');
        
        if (!storedState?.value) {
            return { error: "Invalid OAuth state: Missing CSRF session" };
        }
        
        if (state && storedState.value !== state) {
            return { error: "Invalid OAuth state parameter" };
        }
        
        cookieStore.delete('zernio_oauth_state'); // Clear it after use

        if (errorParam) {
            console.error("Zernio OAuth returned error:", errorParam);
            return { error: "Authentication failed on the provider. Please try again." };
        }

        // Simple connection success
        if (connected) {
            const syncResult = await syncConnectedAccounts();
            if (syncResult.error) {
                return { error: syncResult.error };
            }
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
                const { data } = await (zernio.connect as any).getFacebookPages({
                    headers: { "X-Connect-Token": connectToken },
                });
                entities = data.pages || [];
            } else if (platform === "linkedin" && step === "select_organization") {
                const { data } = await (zernio.connect as any).getPendingOAuthData({
                    query: { token: pendingDataToken },
                });
                entities = data.organizations || [];
            } else if (platform === "pinterest" && step === "select_board") {
                const { data } = await (zernio.connect as any).getPinterestBoards({
                    query: { tempToken },
                    headers: { "X-Connect-Token": connectToken },
                });
                entities = data.boards || [];
            }

            // Securely store the sensitive intermediary tokens on the server
            cookieStore.set('zernio_oauth_session', encrypt(JSON.stringify({ tempToken, userProfile })), {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 10 * 60,
                path: '/'
            });

            return { requiresSelection: true, platform, entities };
        }

        return { error: "Invalid callback state" };
    } catch (error: any) {
        console.error("Callback handling failed:", error);
        return { error: error.message || "Failed to process callback" };
    }
}

export async function selectEntityAndFinalize(platform: string, entityId: string) {
    try {
        const { zernio } = await getZernioClient();
        
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('zernio_oauth_session');
        if (!sessionCookie?.value) {
            return { error: "Session expired. Please try connecting again." };
        }

        const { tempToken, userProfile } = JSON.parse(decrypt(sessionCookie.value));
        cookieStore.delete('zernio_oauth_session'); // Clean up

        if (platform === "facebook") {
            await (zernio.connect as any).selectFacebookPage({
                body: { tempToken, userProfile, pageId: entityId }
            });
        } else if (platform === "linkedin") {
            await (zernio.connect as any).selectLinkedInOrganization({
                body: { tempToken, userProfile, organizationId: entityId }
            });
        } else if (platform === "pinterest") {
            await (zernio.connect as any).selectPinterestBoard({
                body: { tempToken, userProfile, boardId: entityId }
            });
        }
        
        const syncResult = await syncConnectedAccounts();
        if (syncResult.error) {
            return { error: syncResult.error };
        }
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

        // Transactional sync to prevent data loss
        await db.transaction(async (tx) => {
            await tx.delete(socialAccounts).where(eq(socialAccounts.tenantId, tenantId));
            
            if (data.accounts.length > 0) {
                await tx.insert(socialAccounts).values(
                    data.accounts.map((account: any) => ({
                        tenantId,
                        platform: account.platform,
                        platformAccountId: account.id,
                        accountName: account.username || account.name || 'Unknown',
                        avatarUrl: account.picture || null,
                        isActive: true,
                    }))
                );
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
        const { tenantId } = await getZernioClient();
        const accounts = await db.query.socialAccounts.findMany({
            where: eq(socialAccounts.tenantId, tenantId)
        });
        return { accounts };
    } catch (error: any) {
        return { error: "Failed to fetch accounts" };
    }
}

export async function disconnectAccount(accountId: string) {
    try {
        const { tenantId } = await getZernioClient();
        // Here we could also call Zernio API to delete the account from their side if they support it
        // await zernio.accounts.deleteAccount({ accountId });
        
        await db.delete(socialAccounts)
            .where(and(
                eq(socialAccounts.id, accountId), 
                eq(socialAccounts.tenantId, tenantId)
            ));
        
        return { success: true };
    } catch (error: any) {
        console.error("Failed to disconnect account:", error);
        return { error: "Failed to disconnect account" };
    }
}
