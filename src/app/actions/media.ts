'use server';
import { getActiveTenantId } from "@/lib/auth";
import { getRender, cancelRender, retryRender } from "@/lib/media-engine/engine";
export async function getMediaRender(jobId: string) { return getRender(await getActiveTenantId(), jobId); }
export async function cancelMediaRender(jobId: string) { const tenantId = await getActiveTenantId();
  const result = await cancelRender(tenantId, jobId);
  return result; }

export async function retryMediaRender(jobId: string) { return retryRender(await getActiveTenantId(), jobId); }
export async function getMediaUsage() {
  const { mediaUsage } = await import("@/lib/media-engine/usage");
  return mediaUsage(await getActiveTenantId());
}
