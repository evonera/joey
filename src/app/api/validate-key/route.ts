import { NextRequest, NextResponse } from "next/server";
import { Zernio } from "@zernio/node";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getActiveTenantId } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { apiKey } = await req.json();

        if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk_')) {
            return NextResponse.json({ error: "Invalid API key format" }, { status: 400 });
        }

        // Validate the key with Zernio
        const zernio = new Zernio({ apiKey });
        let isValid = false;
        try {
            // Test the Zernio connection using the API key directly (not fully initialized)
            const { data } = await (zernio.connect as any).listAvailablePlatforms();
            isValid = true;
        } catch (e) {
            return NextResponse.json({ error: "Invalid API key or unauthorized" }, { status: 401 });
        }

        if (isValid) {
            let tenantId: string;
            try {
                tenantId = await getActiveTenantId();
            } catch (e) {
                // Create a new organization if they don't have one
                const newOrg = await auth.api.createOrganization({
                    headers: await headers(),
                    body: {
                        name: `${session.user.name}'s Workspace`,
                        slug: session.user.name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(7),
                    }
                });
                tenantId = newOrg.id;
            }

            // Encrypt and store the key
            const encrypted = encrypt(apiKey);
            
            const existingKey = await db.query.apiKeys.findFirst({
                where: eq(apiKeys.tenantId, tenantId)
            });

            if (existingKey) {
                await db.update(apiKeys)
                    .set({ encryptedKey: encrypted, status: 'active' })
                    .where(eq(apiKeys.id, existingKey.id));
            } else {
                await db.insert(apiKeys).values({
                    tenantId: tenantId,
                    provider: 'zernio',
                    encryptedKey: encrypted,
                    status: 'active'
                });
            }

            return NextResponse.json({ success: true });
        }
    } catch (error: any) {
        console.error("[validate-key]", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
