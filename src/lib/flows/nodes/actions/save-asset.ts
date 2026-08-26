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

    const { buildPublicUrl, uploadBufferToR2, deleteObjectWithRetry } = await import("@/lib/storage");
    const ext = url.split("?")[0].split(".").pop() || "bin";
    const key = `${ctx.tenantId}/${crypto.randomUUID()}.${ext}`;
    const publicUrl = buildPublicUrl(key);

    const { db } = await import("@/lib/db");
    const { assets, flowRuns } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");

    // 1. Atomically register the asset in database first under active run lock
    const [asset] = await db.transaction(async (tx) => {
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
      return await tx
        .insert(assets)
        .values({
          tenantId: ctx.tenantId,
          filename: config.filename?.trim() || url.split("/").pop()?.split("?")[0] || "flow-asset",
          key,
          mimeType: contentType.split(";")[0],
          size: buffer.length,
          publicUrl,
        })
        .returning({ id: assets.id, publicUrl: assets.publicUrl });
    });

    // 2. Upload to R2. If upload fails or is aborted, remove the DB asset record and clean up R2
    let uploaded = false;
    try {
      if (ctx.signal?.aborted) {
        throw (ctx.signal.reason as Error) ?? new Error("Aborted");
      }
      await uploadBufferToR2(buffer, contentType.split(";")[0], ctx.tenantId, key);
      uploaded = true;

      return {
        output: {
          publicUrl: asset?.publicUrl ?? publicUrl,
          assetId: asset?.id,
          size: buffer.length,
          contentType,
          source: finalUrl,
        },
      };
    } finally {
      if (!uploaded) {
        await db.delete(assets).where(eq(assets.id, asset.id)).catch(() => {});
        await deleteObjectWithRetry(key).catch(() => {});
      }
    }
  },
});