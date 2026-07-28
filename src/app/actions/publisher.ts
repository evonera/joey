'use server';

import { getZernioClient } from "./zernio";
import { executePublishDraft } from "@/lib/publisher-core";

// Server Action for UI
export async function publishDraft(draftId: string) {
    try {
        const { zernio, tenantId } = await getZernioClient();
        return await executePublishDraft(draftId, tenantId, zernio);
    } catch (error: any) {
        console.error("Failed to publish draft:", error);
        return { error: error.message || "An unexpected error occurred." };
    }
}
