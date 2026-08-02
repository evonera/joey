'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { memories, tenants, agentConfigs } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { syncTenantMemories } from "@/lib/ingest-memories";

export async function getBrandKit() {
    try {
        const tenantId = await getActiveTenantId();

        const config = await db.query.agentConfigs.findFirst({
            where: eq(agentConfigs.tenantId, tenantId)
        });

        const memoryList = await db.query.memories.findMany({
            where: eq(memories.tenantId, tenantId),
            orderBy: [desc(memories.createdAt)],
            limit: 20,
        });

        const typeCounts = await db.execute(
            sql`SELECT type, COUNT(*)::int as count FROM memories WHERE tenant_id = ${tenantId} GROUP BY type`
        );
        const rows = ((typeCounts as any).rows ?? typeCounts) as { type: string; count: number }[];
        const summary = {
            total: rows.reduce((acc, r) => acc + r.count, 0),
            byType: Object.fromEntries(rows.map(r => [r.type, r.count])),
        };

        return {
            config: config ? {
                brandVoice: config.brandVoice,
                postingGoals: config.postingGoals,
            } : null,
            memories: memoryList.map(m => ({
                id: m.id,
                content: m.content,
                type: m.type,
                createdAt: m.createdAt,
                metadata: m.metadata,
            })),
            summary,
        };
    } catch (error: any) {
        console.error("Failed to fetch brand kit:", error);
        return { error: "Failed to fetch brand kit" };
    }
}

export async function reindexMemories() {
    try {
        const tenantId = await getActiveTenantId();
        await syncTenantMemories(tenantId);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to reindex memories:", error);
        return { error: "Failed to reindex memories" };
    }
}
