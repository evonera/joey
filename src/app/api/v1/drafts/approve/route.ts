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
        const { id: draftId, variantName, content } = body;

        if (!draftId) {
            return withRateLimitHeaders(
                NextResponse.json({ error: "Missing draft id" }, { status: 400 }),
                rateLimit
            );
        }

        const updateData: Partial<typeof drafts.$inferInsert> & { status: string; errorMessage: null } = { status: "approved", errorMessage: null };
        if (variantName && content) {
            updateData.selectedVariantId = variantName;
            updateData.content = content;
        } else {
            const existing = await db.query.drafts.findFirst({
                where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)),
                columns: { content: true }
            });
            if (!existing?.content) {
                return withRateLimitHeaders(
                    NextResponse.json({ error: "Cannot approve a draft without content. Please select a variant." }, { status: 400 }),
                    rateLimit
                );
            }
        }

        await db.update(drafts)
            .set(updateData)
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
