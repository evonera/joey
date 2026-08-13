import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { drafts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const { tenantId } = await authenticateApiRequest(request);
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

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
