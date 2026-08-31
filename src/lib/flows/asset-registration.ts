import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, flowRuns, r2CleanupTasks } from "@/lib/db/schema";
import { cancelR2Cleanup, enqueueR2Cleanup, rearmR2Cleanup } from "@/lib/storage-cleanup";
import { deleteObjectWithRetry, uploadBufferToR2 } from "@/lib/storage";

export type AssetRegistration = { id: string; key: string; publicUrl: string };

export async function runReservedUpload<T>(steps: {
  reserve: () => Promise<void>; upload: () => Promise<void>; register: () => Promise<T>;
  compensate: () => Promise<void>; rearm: () => Promise<void>;
}): Promise<T> {
  await steps.reserve();
  let uploaded = false;
  try {
    await steps.upload();
    uploaded = true;
    return await steps.register();
  } catch (error) {
    if (uploaded) {
      try { await steps.compensate(); }
      catch { await steps.rearm(); }
    }
    throw error;
  }
}

export async function uploadAndRegisterFlowAsset(options: {
  tenantId: string; runId: string; key: string; filename: string; mimeType: string;
  body: Buffer; signal?: AbortSignal; reason: string;
}): Promise<AssetRegistration> {
  const { tenantId, runId, key, body, signal } = options;
  let object: { key: string; publicUrl: string };
  return runReservedUpload({
    reserve: () => enqueueR2Cleanup(tenantId, key, options.reason, { runId }),
    upload: async () => { object = await uploadBufferToR2(body, options.mimeType, tenantId, { customKey: key, signal }); },
    register: async () => {
      if (signal?.aborted) throw signal.reason ?? new Error("Asset registration aborted.");
      const [asset] = await db.transaction(async (tx) => {
      const [reservation] = await tx.select({ id: r2CleanupTasks.id }).from(r2CleanupTasks).where(and(eq(r2CleanupTasks.key, key), eq(r2CleanupTasks.tenantId, tenantId))).for("update");
      if (!reservation) throw new Error("Asset cleanup reservation was lost before registration.");
      const [run] = await tx.select({ id: flowRuns.id }).from(flowRuns).where(and(eq(flowRuns.id, runId), eq(flowRuns.tenantId, tenantId), eq(flowRuns.status, "running"))).for("update");
      if (!run) throw new Error("Execution fenced: flow run is no longer running.");
      const inserted = await tx.insert(assets).values({ tenantId, filename: options.filename, key, mimeType: options.mimeType, size: body.length, publicUrl: object.publicUrl }).returning({ id: assets.id, key: assets.key, publicUrl: assets.publicUrl });
      await tx.delete(r2CleanupTasks).where(and(eq(r2CleanupTasks.id, reservation.id), eq(r2CleanupTasks.tenantId, tenantId)));
      return inserted;
    });
      return asset;
    },
    compensate: async () => { await deleteObjectWithRetry(key); await cancelR2Cleanup(key); },
    rearm: () => rearmR2Cleanup(tenantId, key, `compensation required: ${options.reason}`),
  });
}
