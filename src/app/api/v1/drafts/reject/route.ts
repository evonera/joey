import { NextResponse } from 'next/server';
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { drafts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: Request) {
    try {
        const { tenantId, scopes, rateLimit } = await authenticateApiRequest(request);
        requireScope(scopes, "approve");
        const body = await request.json();
        const { id: draftId, feedback } = body;

        if (!draftId) {
            return withRateLimitHeaders(
                NextResponse.json({ error: "Missing draft id" }, { status: 400 }),
                rateLimit
            );
        }

        const updated = await db.update(drafts)
            .set({ status: "rejected", errorMessage: feedback })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)))
            .returning();

        if (updated.length === 0) {
            return withRateLimitHeaders(
                NextResponse.json({ error: "Draft not found" }, { status: 404 }),
                rateLimit
            );
        }

        return withRateLimitHeaders(NextResponse.json({ success: true }), rateLimit);
    } catch (error: any) {
        if (error.name === 'RateLimitError') {
            return NextResponse.json({ error: error.message }, { status: 429 });
        }
        if (error.message.startsWith('Insufficient scope')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
