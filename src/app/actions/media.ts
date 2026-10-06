'use server';
import { getActiveTenantId, requireRole } from "@/lib/auth";
import { getRender, cancelRender, retryRender } from "@/lib/media-engine/engine";
export async function getMediaRender(jobId: string) { return getRender(await getActiveTenantId(), jobId); }
export async function cancelMediaRender(jobId: string) { const tenantId = await requireRole(["owner", "admin", "editor", "member"]);
  const result = await cancelRender(tenantId, jobId);
  return result; }

export async function retryMediaRender(jobId: string) { return retryRender(await requireRole(["owner", "admin", "editor", "member"]), jobId); }
export async function getMediaUsage() {
  const { mediaUsage } = await import("@/lib/media-engine/usage");
  return mediaUsage(await getActiveTenantId());
}
