'use server';

import { auth, getActiveTenantId } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { memories, tenants } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function getInsights() {
    try {
        const tenantId = await getActiveTenantId();
        const insights = await db.query.memories.findMany({
            where: and(
                eq(memories.tenantId, tenantId),
                eq(memories.type, "strategy_insight"),
            ),
            orderBy: [desc(memories.createdAt)],
            limit: 50,
        });

        return {
            insights: insights.map(m => ({
                id: m.id,
                content: m.content,
                createdAt: m.createdAt,
                metadata: m.metadata,
            })),
        };
    } catch (error: any) {
        console.error("Failed to fetch insights:", error);
        return { error: "Failed to fetch insights" };
    }
}
