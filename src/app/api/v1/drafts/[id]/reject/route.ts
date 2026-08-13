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
        const { feedback } = body;

        await db.update(drafts)
            .set({ status: "rejected", errorMessage: feedback })
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
