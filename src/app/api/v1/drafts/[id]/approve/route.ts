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
        const { variantName, content } = body;

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
                return NextResponse.json({ error: "Cannot approve a draft without content. Please select a variant." }, { status: 400 });
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
