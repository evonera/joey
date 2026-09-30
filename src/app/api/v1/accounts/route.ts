import { NextResponse } from 'next/server';
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { socialAccounts } from '@/lib/db/schema';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { cursorTimestamp, makeNextCursor, parsePageRequest } from '@/lib/http/cursor-pagination';
import { apiErrorResponse } from '@/lib/api-error-response';

export async function GET(request: Request) {
    try {
        const { tenantId, scopes, rateLimit } = await authenticateApiRequest(request);
        requireScope(scopes, "read");
        const page = parsePageRequest(new URL(request.url).searchParams);
        if (!page.ok) return withRateLimitHeaders(NextResponse.json({ error: page.error }, { status: 400 }), rateLimit);

        const cursorDate = cursorTimestamp(socialAccounts.createdAt);
        const conditions = [eq(socialAccounts.tenantId, tenantId)];
        if (page.cursor) conditions.push(or(
            lt(cursorDate, page.cursor.createdAt),
            and(eq(cursorDate, page.cursor.createdAt), lt(socialAccounts.id, page.cursor.id)),
        )!);
        const rows = await db.query.socialAccounts.findMany({
            where: and(...conditions),
            orderBy: [desc(cursorDate), desc(socialAccounts.id)],
            limit: page.limit + 1,
        });
        const data = rows.slice(0, page.limit);
        const nextCursor = rows.length > page.limit ? makeNextCursor(data.at(-1)) : null;

        return withRateLimitHeaders(NextResponse.json({ accounts: data, nextCursor }), rateLimit);
    } catch (error: unknown) {
        return apiErrorResponse(error);
    }
}
