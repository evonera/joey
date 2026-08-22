import { defineNode } from "../../node-contract";
import { webhookTriggerConfig } from "../../catalog";

const configSchema = webhookTriggerConfig;

export const webhookTriggerNode = defineNode({
  type: "trigger.webhook",
  category: "trigger",
  label: "Zernio webhook",
  description: "Starts the flow when Zernio sends a matching real-time event (comments, mentions).",
  inputs: [],
  outputs: ["event"],
  isTrigger: true,
  configSchema,
  async execute(_input, _config, ctx) {
    return { output: ctx.triggerPayload ?? null };
  },
});
