import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: Request) {
    try {
        const { tenantId } = await authenticateApiRequest(request);

        const data = await db.query.posts.findMany({
            where: eq(posts.tenantId, tenantId),
            orderBy: [desc(posts.publishedAt)]
        });

        return NextResponse.json({ posts: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
