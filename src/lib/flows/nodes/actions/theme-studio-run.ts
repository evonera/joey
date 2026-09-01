import { themeStudioRunConfig } from "../../catalog";
import { defineNode } from "../../node-contract";

export const themeStudioRunNode = defineNode({
  type: "action.theme_studio_run",
  category: "action",
  label: "Run Theme Studio recipe",
  description: "Ingests configured sources and stages rights-compliant content packages for human review.",
  inputs: ["data"],
  outputs: ["report"],
  configSchema: themeStudioRunConfig,
  async execute(_input, rawConfig, ctx) {
    const config = themeStudioRunConfig.parse(rawConfig);
    ctx.signal?.throwIfAborted();
    await ctx.heartbeat?.();
    const { runEditorialPipeline } = await import("@/lib/theme-studio/pipeline/orchestrator");
    const report = await runEditorialPipeline(config.themePageId);
    await ctx.heartbeat?.();
    return { output: report };
  },
});
