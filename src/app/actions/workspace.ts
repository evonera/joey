'use server';

import { getActiveTenantId } from "@/lib/auth";

/**
 * Returns the authoritative active tenant ID resolved by the server.
 * If the session's active organization is stale or unset, this triggers
 * the server's newest-membership fallback and syncs the session.
 */
export async function getAuthoritativeActiveTenantId(): Promise<string | null> {
    try {
        return await getActiveTenantId();
    } catch {
        return null;
    }
}
