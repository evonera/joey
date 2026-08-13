import { NextResponse } from 'next/server';
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { socialAccounts } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: Request) {
    try {
        const { tenantId, scopes, rateLimit } = await authenticateApiRequest(request);
        requireScope(scopes, "read");

        const data = await db.query.socialAccounts.findMany({
            where: eq(socialAccounts.tenantId, tenantId),
            orderBy: [desc(socialAccounts.createdAt)]
        });

        return withRateLimitHeaders(NextResponse.json({ accounts: data }), rateLimit);
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
