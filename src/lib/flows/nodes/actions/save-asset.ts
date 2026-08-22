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

    const response = await fetch(url, { signal: ctx.signal });
    if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 25 * 1024 * 1024) throw new Error("File exceeds the 25MB asset limit.");

    const { uploadBufferToR2 } = await import("@/lib/storage");
    const uploaded = await uploadBufferToR2(buffer, contentType.split(";")[0], ctx.tenantId);

    const { registerAsset } = await import("@/app/actions/assets");
    await registerAsset({
      filename: config.filename?.trim() || url.split("/").pop()?.split("?")[0] || "flow-asset",
      key: uploaded.key,
      mimeType: contentType.split(";")[0],
      size: buffer.length,
    });

    return { output: { publicUrl: uploaded.publicUrl, size: buffer.length, contentType } };
  },
});
