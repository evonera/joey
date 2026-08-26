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

    const { uploadBufferToR2 } = await import("@/lib/storage");
    const uploaded = await uploadBufferToR2(buffer, contentType.split(";")[0], ctx.tenantId);

    if (ctx.signal?.aborted) {
      throw (ctx.signal.reason as Error) ?? new Error("Aborted");
    }

    // Register the asset with a direct tenant-scoped insert — registerAsset
    // requires a browser session and would throw Unauthorized during
    // scheduled/webhook runs.
    const { db } = await import("@/lib/db");
    const { assets } = await import("@/lib/db/schema");
    const [asset] = await db
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

    return {
      output: {
        publicUrl: asset?.publicUrl ?? uploaded.publicUrl,
        assetId: asset?.id,
        size: buffer.length,
        contentType,
        source: finalUrl,
      },
    };
  },
});