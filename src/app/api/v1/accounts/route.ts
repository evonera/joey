import { NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { socialAccounts } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: Request) {
    try {
        const { tenantId } = await authenticateApiRequest(request);

        const data = await db.query.socialAccounts.findMany({
            where: eq(socialAccounts.tenantId, tenantId),
            orderBy: [desc(socialAccounts.createdAt)]
        });

        return NextResponse.json({ accounts: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
