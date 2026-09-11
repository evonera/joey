import { defineNode } from "../../node-contract";
import { renderMediaConfig } from "../../catalog";
export const renderMediaNode = defineNode({
  type: "action.render_media", category: "action", label: "Render finished media",
  description: "Creates a finished image or video from an uploaded workspace asset. Returns the export only after rendering succeeds.",
  inputs: ["data"], outputs: ["media"], configSchema: renderMediaConfig,
  async execute(input, raw, ctx) {
    const config = renderMediaConfig.parse(raw);
    const { db } = await import("@/lib/db");
    const { assets } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const { submitRender, getRender } = await import("@/lib/media-engine/engine");
    async function ref(id: string) {
      const row = await db.query.assets.findFirst({ where: and(eq(assets.id, id), eq(assets.tenantId, ctx.tenantId)) });
      if (!row) throw new Error("Source asset not found in this workspace.");
      return { id: row.id, version: row.key };
    }
    const text = typeof input === "string" ? input : input && typeof input === "object" && "caption" in input ? String(input.caption) : "";
    const video = config.template === "branded_clip" || config.template === "minimal_meme";
    const { createHash } = await import("node:crypto");
    const sourceAssetId = config.mediaAssetId ?? (input && typeof input === "object" && "assetId" in input && typeof input.assetId === "string" ? input.assetId : undefined);
    if (!sourceAssetId) throw new Error("Choose a source asset or provide an incoming assetId.");
    const job = await submitRender(ctx.tenantId, {
      version: 1, source: { kind: "flow", id: ctx.flowId, revision: createHash("sha256").update(`${ctx.runId}:${ctx.nodeId}:${ctx.itemKey ?? "root"}`).digest("hex") },
      template: config.template, templateVersion: 1, format: video ? "mp4" : "png",
      media: await ref(sourceAssetId), ...(config.insetAssetId ? { inset: await ref(config.insetAssetId) } : {}),
      crop: { mode: video ? "contain" : "cover", x: .5, y: .5 },
      title: config.title.replaceAll("{{input}}", text), brand: { name: config.brandName, handle: config.handle },
      ...(video ? { video: { duration: config.durationSeconds, captions: config.captions } } : {}),
    });
    for (let i = 0; i < 100; i++) {
      ctx.signal?.throwIfAborted();
      await ctx.heartbeat?.();
      const result = await getRender(ctx.tenantId, job.jobId);
      if (result.status === "succeeded" && result.output) return { output: { assetId: result.output.id, mediaUrls: [result.output.publicUrl], caption: text || config.title, renderJobId: job.jobId } };
      if (result.status === "failed" || result.status === "cancelled") throw new Error(result.error || "Render cancelled.");
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error("Rendering is still queued. Retry this node to retrieve the same job without submitting a duplicate.");
  },
});
