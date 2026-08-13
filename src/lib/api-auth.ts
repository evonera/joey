import { db } from "@/lib/db";
import { publicApiTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function authenticateApiRequest(request: Request) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Missing or invalid Authorization header");
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
        throw new Error("Missing token");
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const apiToken = await db.query.publicApiTokens.findFirst({
        where: eq(publicApiTokens.tokenHash, tokenHash)
    });

    if (!apiToken) {
        throw new Error("Invalid API token");
    }

    if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
        throw new Error("API token expired");
    }

    // Update lastUsedAt asynchronously (fire-and-forget)
    db.update(publicApiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(publicApiTokens.id, apiToken.id))
        .execute()
        .catch(err => console.error("Failed to update lastUsedAt", err));

    return { tenantId: apiToken.tenantId, tokenId: apiToken.id };
}
