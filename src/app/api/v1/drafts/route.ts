import { NextResponse } from 'next/server';
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { drafts } from '@/lib/db/schema';
import { eq, and, desc, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { validateSafeUrl } from '@/lib/flows/nodes/ai/transcribe';
import { cursorTimestamp, makeNextCursor, parsePageRequest } from '@/lib/http/cursor-pagination';
import { readBoundedJson } from '@/lib/http/read-bounded-json';
import { apiErrorResponse } from '@/lib/api-error-response';

const createDraftSchema = z.object({
    content: z.string().min(1, "Draft content cannot be empty").max(50000, "Draft content exceeds maximum length of 50,000 characters"),
    platform: z.string().max(50).optional(),
    mediaUrls: z.array(z.string().url("Invalid media URL format").max(2048)).max(10, "Maximum 10 media URLs allowed").optional(),
    accountIds: z.array(z.string().max(128)).max(20).optional(),
    scheduledFor: z.string().datetime({ message: "scheduledFor must be a valid ISO 8601 datetime string" }).nullable().optional(),
}).strict();

export async function GET(request: Request) {
    try {
        const { tenantId, scopes, rateLimit } = await authenticateApiRequest(request);
        requireScope(scopes, "read");
        const { searchParams } = new URL(request.url);
        const page = parsePageRequest(searchParams);
        if (!page.ok) return withRateLimitHeaders(NextResponse.json({ error: page.error }, { status: 400 }), rateLimit);
        const status = searchParams.get('status');

        let conditions = [eq(drafts.tenantId, tenantId)];
        if (status) {
            conditions.push(eq(drafts.status, status));
        }
        const cursorDate = cursorTimestamp(drafts.createdAt);
        if (page.cursor) conditions.push(or(
            lt(cursorDate, page.cursor.createdAt),
            and(eq(cursorDate, page.cursor.createdAt), lt(drafts.id, page.cursor.id)),
        )!);

        const rows = await db.query.drafts.findMany({
            where: and(...conditions),
            orderBy: [desc(cursorDate), desc(drafts.id)],
            limit: page.limit + 1,
        });
        const data = rows.slice(0, page.limit);
        const nextCursor = rows.length > page.limit ? makeNextCursor(data.at(-1)) : null;

        return withRateLimitHeaders(NextResponse.json({ drafts: data, nextCursor }), rateLimit);
    } catch (error: unknown) {
        return apiErrorResponse(error);
    }
}

export async function POST(request: Request) {
    let authRateLimit: any;
    try {
        const { tenantId, scopes, rateLimit } = await authenticateApiRequest(request);
        authRateLimit = rateLimit;
        requireScope(scopes, "write");

        const body = await readBoundedJson<unknown>(request, 256 * 1024);
        if (!body.ok) {
            return withRateLimitHeaders(NextResponse.json({
                error: body.reason === "too_large" ? "Request body is too large" : "Invalid JSON body",
            }, { status: body.reason === "too_large" ? 413 : 400 }), authRateLimit);
        }

        const parseResult = createDraftSchema.safeParse(body.value);
        if (!parseResult.success) {
            const errorMsg = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
            return withRateLimitHeaders(NextResponse.json({ error: errorMsg }, { status: 400 }), authRateLimit);
        }

        const { content, platform, mediaUrls, accountIds, scheduledFor } = parseResult.data;

        // SSRF guard: Validate that all media URLs are safe external public destinations
        if (mediaUrls && mediaUrls.length > 0) {
            for (const url of mediaUrls) {
                try {
                    await validateSafeUrl(url);
                } catch (ssrfErr: any) {
                    return withRateLimitHeaders(
                        NextResponse.json({ error: `Unsafe media URL rejected: ${ssrfErr.message}` }, { status: 400 }),
                        authRateLimit
                    );
                }
            }
        }

        const canonicalPlatform = platform
            ? (platform.trim().toLowerCase() === "twitter" ? "x" : platform.trim().toLowerCase())
            : undefined;

        const [draft] = await db.insert(drafts).values({
            tenantId,
            content,
            status: "pending_review",
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            platformOptions: { mediaUrls, accountIds, platform: canonicalPlatform }
        }).returning();

        return withRateLimitHeaders(NextResponse.json({ draft }), authRateLimit);
    } catch (error: unknown) {
        return apiErrorResponse(error, authRateLimit);
    }
}
