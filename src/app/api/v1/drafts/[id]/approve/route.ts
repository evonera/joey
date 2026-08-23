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
        }

        // Existence + tenant check ALWAYS runs so a bad id or foreign draft
        // can never report success.
        const existing = await db.query.drafts.findFirst({
            where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)),
            columns: { content: true }
        });
        if (!existing) {
            return NextResponse.json({ error: "Draft not found" }, { status: 404 });
        }
        if (!variantName && !existing.content) {
            return NextResponse.json({ error: "Cannot approve a draft without content. Please select a variant." }, { status: 400 });
        }

        const updated = await db.update(drafts)
            .set(updateData)
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)))
            .returning({ id: drafts.id });

        if (updated.length === 0) {
            return NextResponse.json({ error: "Draft not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
