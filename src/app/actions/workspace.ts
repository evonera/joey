'use server';

import { auth } from "@/lib/auth";
import { headers } from "next/headers.js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export interface AuthoritativeWorkspaceData {
    activeTenantId: string | null;
    orderedTenantIds: string[];
}

/**
 * Returns the authoritative active tenant ID and ordered tenant IDs from the database,
 * ordered by membership creation time descending (newest membership first).
 * This ensures the client switcher precisely mirrors server tenant resolution even under fallback.
 */
export async function getAuthoritativeWorkspaceData(): Promise<AuthoritativeWorkspaceData> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return { activeTenantId: null, orderedTenantIds: [] };
        }

        const memberships = await db.query.member.findMany({
            where: eq(schema.member.userId, session.user.id),
            orderBy: [desc(schema.member.createdAt)],
        });

        const orderedTenantIds = memberships.map(m => m.organizationId);
        let activeTenantId: string | null = null;

        if (session.session.activeOrganizationId && orderedTenantIds.includes(session.session.activeOrganizationId)) {
            activeTenantId = session.session.activeOrganizationId;
        } else if (orderedTenantIds.length > 0) {
            activeTenantId = orderedTenantIds[0];
            await auth.api.setActiveOrganization({
                headers: await headers(),
                body: { organizationId: activeTenantId }
            }).catch(() => {});
        }

        return { activeTenantId, orderedTenantIds };
    } catch {
        return { activeTenantId: null, orderedTenantIds: [] };
    }
}
