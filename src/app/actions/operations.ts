"use server";

import { getActiveTenantId } from "@/lib/auth";
import { getOperationalHealth } from "@/lib/operations";

export async function getTenantOperationalHealth() {
  const tenantId = await getActiveTenantId();
  return getOperationalHealth(tenantId);
}
