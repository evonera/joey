import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { drafts } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(request: Request) {
    try {
        const { tenantId } = await authenticateApiRequest(request);
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        let conditions = [eq(drafts.tenantId, tenantId)];
        if (status) {
            conditions.push(eq(drafts.status, status));
        }

        const data = await db.query.drafts.findMany({
            where: and(...conditions),
            orderBy: [desc(drafts.createdAt)]
        });

        return NextResponse.json({ drafts: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}

export async function POST(request: Request) {
    try {
        const { tenantId } = await authenticateApiRequest(request);
        const body = await request.json();
        const { content, mediaUrls, accountIds, scheduledFor } = body;

        const [draft] = await db.insert(drafts).values({
            tenantId,
            content,
            status: "pending_review",
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            platformOptions: { mediaUrls, accountIds }
        }).returning();

        return NextResponse.json({ draft });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
