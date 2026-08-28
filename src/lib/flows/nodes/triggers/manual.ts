import { defineNode } from "../../node-contract";
import { manualTriggerConfig } from "../../catalog";

export const manualTriggerNode = defineNode({
  type: "trigger.manual",
  category: "trigger",
  label: "Manual start",
  description: "Starts the flow when run manually (or on a schedule you set).",
  inputs: [],
  outputs: ["data"],
  isTrigger: true,
  configSchema: manualTriggerConfig,
  async execute(_input, config, ctx) {
    if (ctx.triggerPayload !== undefined) {
      return { output: ctx.triggerPayload };
    }
    const parsed = (config as { samplePayload?: string }).samplePayload;
    if (parsed) {
      try {
        return { output: JSON.parse(parsed) };
      } catch {
        return { output: parsed };
      }
    }
    return { output: null };
  },
});
