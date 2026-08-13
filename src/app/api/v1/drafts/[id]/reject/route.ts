import { NextResponse } from 'next/server';
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { drafts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const { tenantId, scopes, rateLimit } = await authenticateApiRequest(request);
        requireScope(scopes, "approve");
        const params = await props.params;
        const draftId = params.id;
        const body = await request.json().catch(() => ({}));
        const { feedback } = body;

        await db.update(drafts)
            .set({ status: "rejected", errorMessage: feedback })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

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
