import { defineNode } from "../../node-contract";
import { saveAssetConfig } from "../../catalog";

function extractUrl(input: unknown, field?: string): string | undefined {
  if (field) {
    return field
      .split(".")
      .reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), input) as string | undefined;
  }
  if (typeof input === "string" && /^https?:\/\//.test(input)) return input;
  if (input && typeof input === "object") {
    for (const key of ["imageUrl", "url", "fileUrl", "link"]) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
  }
  return undefined;
}

export const saveAssetNode = defineNode({
  type: "action.save_asset",
  category: "action",
  label: "Save to Assets",
  description: "Downloads a file URL into your asset library so drafts can attach it.",
  inputs: ["file"],
  outputs: ["asset"],
  configSchema: saveAssetConfig,
  async execute(input, rawConfig, ctx) {
    const config = saveAssetConfig.parse(rawConfig);

    const url = extractUrl(input, config.urlField);
    if (!url) throw new Error("No file URL found on the incoming data.");

    // SSRF-safe download: DNS is resolved once and pinned to the validated
    // public IP; private/metadata destinations are rejected. Redirects are
    // re-validated per hop.
    const { fetchSafeMedia } = await import("../ai/transcribe");
    const { buffer, contentType, finalUrl } = await fetchSafeMedia(url, ctx.signal);
    if (buffer.length > 25 * 1024 * 1024) throw new Error("File exceeds the 25MB asset limit.");

    if (ctx.signal?.aborted) {
      throw (ctx.signal.reason as Error) ?? new Error("Aborted");
    }

    const { db } = await import("@/lib/db");
    const { assets, flowRuns } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");

    if (ctx.runId) {
      const [activeRun] = await db
        .select({ id: flowRuns.id })
        .from(flowRuns)
        .where(and(eq(flowRuns.id, ctx.runId), eq(flowRuns.status, "running")));
      if (!activeRun) {
        throw new Error("Execution fenced: flow run is no longer running.");
      }
    }

    const { uploadBufferToR2, deleteObjectWithRetry } = await import("@/lib/storage");
    const ext = url.split("?")[0].split(".").pop() || "bin";
    const key = `${ctx.tenantId}/${crypto.randomUUID()}.${ext}`;
    const { enqueueR2Cleanup } = await import("@/lib/storage-cleanup");
    // Reserve cleanup before the irreversible upload. The grace period prevents
    // the scheduler from racing a healthy upload, while a crash after upload
    // still leaves a durable owner that will remove the orphan.
    await enqueueR2Cleanup(ctx.tenantId, key, "asset upload pending registration", {
      notBefore: new Date(Date.now() + 10 * 60_000),
    });

    const uploaded = await uploadBufferToR2(buffer, contentType.split(";")[0], ctx.tenantId, {
      customKey: key,
      signal: ctx.signal,
    });

    let registered = false;
    let asset: { id: string; publicUrl: string } | undefined;
    try {
      if (ctx.signal?.aborted) {
        throw (ctx.signal.reason as Error) ?? new Error("Aborted");
      }

      const { db } = await import("@/lib/db");
      const { assets, flowRuns, r2CleanupTasks } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      [asset] = await db.transaction(async (tx) => {
        const [reservation] = await tx
          .select({ id: r2CleanupTasks.id })
          .from(r2CleanupTasks)
          .where(eq(r2CleanupTasks.key, uploaded.key))
          .for("update");
        if (!reservation) {
          throw new Error("Asset upload reservation expired before registration.");
        }
        if (ctx.runId) {
          const [lockedRun] = await tx
            .select({ id: flowRuns.id })
            .from(flowRuns)
            .where(and(eq(flowRuns.id, ctx.runId), eq(flowRuns.status, "running")))
            .for("update");
          if (!lockedRun) {
            throw new Error("Execution fenced: flow run is no longer running.");
          }
        }
        const inserted = await tx
          .insert(assets)
          .values({
            tenantId: ctx.tenantId,
            filename: config.filename?.trim() || url.split("/").pop()?.split("?")[0] || "flow-asset",
            key: uploaded.key,
            mimeType: contentType.split(";")[0],
            size: buffer.length,
            publicUrl: uploaded.publicUrl,
          })
          .returning({ id: assets.id, publicUrl: assets.publicUrl });
        await tx.delete(r2CleanupTasks).where(eq(r2CleanupTasks.id, reservation.id));
        return inserted;
      });
      registered = true;

      return {
        output: {
          publicUrl: asset?.publicUrl ?? uploaded.publicUrl,
          assetId: asset?.id,
          size: buffer.length,
          contentType,
          source: finalUrl,
        },
      };
    } finally {
      if (!registered && uploaded?.key) {
        try {
          await deleteObjectWithRetry(uploaded.key);
          const { cancelR2Cleanup } = await import("@/lib/storage-cleanup");
          await cancelR2Cleanup(uploaded.key);
        } catch (cleanupError) {
          await enqueueR2Cleanup(ctx.tenantId, uploaded.key, "asset registration failed");
          console.error("[flows/save-asset] queued orphaned object cleanup", cleanupError);
        }
      }
    }
  },
});
