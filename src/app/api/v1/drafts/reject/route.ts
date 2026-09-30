import { NextResponse } from 'next/server';
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from '@/lib/api-auth';
import { z } from 'zod';
import { readBoundedJson } from '@/lib/http/read-bounded-json';
import { reviewDraft } from '@/lib/draft-review';
import { apiErrorResponse } from '@/lib/api-error-response';

const bodySchema = z.object({
    id: z.string().min(1).max(128),
    feedback: z.string().max(5_000).optional(),
}).strict();

export async function POST(request: Request) {
    try {
        const { tenantId, scopes, rateLimit } = await authenticateApiRequest(request);
        requireScope(scopes, "approve");
        const parsed = await readBoundedJson<unknown>(request, 32 * 1024);
        if (!parsed.ok) {
            const status = parsed.reason === "too_large" ? 413 : 400;
            return withRateLimitHeaders(NextResponse.json({ error: parsed.reason === "too_large" ? "Request body is too large" : "Invalid JSON body" }, { status }), rateLimit);
        }
        const body = bodySchema.safeParse(parsed.value);
        if (!body.success) return withRateLimitHeaders(NextResponse.json({ error: "Invalid rejection request" }, { status: 400 }), rateLimit);

        const result = await reviewDraft({ tenantId, draftId: body.data.id, decision: "reject", feedback: body.data.feedback });
        if ("error" in result && result.error) {
            const status = result.error === "Draft not found" ? 404 : result.error.startsWith("This draft is already") ? 409 : 400;
            return withRateLimitHeaders(NextResponse.json({ error: result.error }, { status }), rateLimit);
        }
        return withRateLimitHeaders(NextResponse.json({ success: true }), rateLimit);
    } catch (error: unknown) {
        if (error instanceof Error && !/Unauthorized|Insufficient scope|RateLimit/.test(error.message)) {
            console.error("[api/v1/drafts/reject] unexpected error", error);
        }
        return apiErrorResponse(error);
    }
}
