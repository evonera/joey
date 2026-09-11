import { getActiveTenantId } from "@/lib/auth";
import { getZernioClientForTenant } from "@/lib/publisher-core";

// Server-side helper, deliberately not a remotely callable Server Action.
export async function getZernioClient() {
  return getZernioClientForTenant(await getActiveTenantId());
}
