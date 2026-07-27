import { NextRequest, NextResponse } from "next/server";
import { Zernio } from "@zernio/node";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys, tenants } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { apiKey } = await req.json();

        if (!apiKey || !apiKey.startsWith('sk_')) {
            return NextResponse.json({ error: "Invalid API key format" }, { status: 400 });
        }

        // Validate the key with Zernio
        const zernio = new Zernio({ apiKey });
        let isValid = false;
        try {
            // Ping an endpoint to verify (e.g. list platforms or get current user)
            await zernio.connect.listAvailablePlatforms();
            isValid = true;
        } catch (e) {
            return NextResponse.json({ error: "Invalid API key or unauthorized" }, { status: 401 });
        }

        if (isValid) {
            // Upsert tenant for the user if not exists
            let tenant = await db.query.tenants.findFirst({
                where: eq(tenants.ownerId, session.user.id)
            });

            if (!tenant) {
                const [newTenant] = await db.insert(tenants).values({
                    name: `${session.user.name}'s Workspace`,
                    ownerId: session.user.id
                }).returning();
                tenant = newTenant;
            }

            // Encrypt and store the key
            const encrypted = encrypt(apiKey);
            
            // Upsert the API key
            const existingKey = await db.query.apiKeys.findFirst({
                where: eq(apiKeys.tenantId, tenant.id)
            });

            if (existingKey) {
                await db.update(apiKeys)
                    .set({ encryptedKey: encrypted, status: 'active' })
                    .where(eq(apiKeys.id, existingKey.id));
            } else {
                await db.insert(apiKeys).values({
                    tenantId: tenant.id,
                    provider: 'zernio',
                    encryptedKey: encrypted,
                    status: 'active'
                });
            }

            return NextResponse.json({ success: true });
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
