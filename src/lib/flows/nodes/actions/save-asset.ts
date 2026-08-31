import { extname } from "node:path";
import { saveAssetConfig } from "../../catalog";
import { defineNode } from "../../node-contract";
import { outboundRequest } from "../../outbound-request";
import { uploadAndRegisterFlowAsset } from "../../asset-registration";

function pathValue(input: unknown, path?: string): unknown {
  return path ? path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, input) : input;
}
function assetUrl(input: unknown, field?: string): string | undefined {
  const value = pathValue(input, field);
  if (typeof value === "string") return value;
  if (value && typeof value === "object") for (const key of ["imageUrl", "url", "fileUrl", "link"]) { const candidate = (value as Record<string, unknown>)[key]; if (typeof candidate === "string") return candidate; }
}

export const saveAssetNode = defineNode({
  type: "action.save_asset", category: "action", label: "Save to Assets", description: "Safely downloads a public file and registers it in the asset library.",
  inputs: ["file"], outputs: ["asset"], configSchema: saveAssetConfig,
  async execute(input, rawConfig, ctx) {
    const config = saveAssetConfig.parse(rawConfig);
    const url = assetUrl(input, config.urlField);
    if (!url) throw new Error("No asset URL found in the input.");
    const response = await outboundRequest(url, { signal: ctx.signal, timeoutMs: 60_000, maxBytes: 25 * 1024 * 1024 });
    if (response.status < 200 || response.status >= 300) throw new Error(`Asset download returned HTTP ${response.status}.`);
    const mimeType = String(response.headers["content-type"] ?? "application/octet-stream").split(";")[0];
    const suffix = extname(new URL(response.finalUrl).pathname).replace(/[^.A-Za-z0-9]/g, "").slice(0, 12) || ".bin";
    const asset = await uploadAndRegisterFlowAsset({ tenantId: ctx.tenantId, runId: ctx.runId, key: `${ctx.tenantId}/${crypto.randomUUID()}${suffix}`, filename: config.filename?.trim() || `flow-asset${suffix}`, mimeType, body: response.buffer, signal: ctx.signal, reason: "asset upload pending registration" });
    return { output: { assetId: asset.id, key: asset.key, publicUrl: asset.publicUrl, size: response.buffer.length, mimeType, source: response.finalUrl } };
  },
});
