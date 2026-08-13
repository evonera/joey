import { db } from "@/lib/db";
import { publicApiTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export class RateLimitError extends Error {
    constructor(public resetAt: number) {
        super("Rate limit exceeded");
        this.name = 'RateLimitError';
    }
}

export function requireScope(scopes: string[], required: string) {
    if (!scopes.includes(required)) {
        throw new Error(`Insufficient scope: requires '${required}'`);
    }
}

export function withRateLimitHeaders(response: NextResponse, rateLimit: { remaining: number; resetAt: number }): NextResponse {
    response.headers.set('X-RateLimit-Limit', '60');
    response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetAt / 1000)));
    return response;
}

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

    const rateLimit = checkRateLimit(apiToken.id);
    if (!rateLimit.allowed) {
        throw new RateLimitError(rateLimit.resetAt);
    }

    // Update lastUsedAt asynchronously (fire-and-forget)
    db.update(publicApiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(publicApiTokens.id, apiToken.id))
        .execute()
        .catch(err => console.error("Failed to update lastUsedAt", err));

    return { tenantId: apiToken.tenantId, tokenId: apiToken.id, scopes: apiToken.scopes, rateLimit };
}
