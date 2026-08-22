import { defineNode } from "../../node-contract";
import { incomingWebhookConfig } from "../../catalog";

export const incomingWebhookNode = defineNode({
  type: "trigger.incoming_webhook",
  category: "trigger",
  label: "Incoming webhook",
  description: "Starts the flow when anything POSTs JSON to this flow's private URL.",
  inputs: [],
  outputs: ["payload"],
  isTrigger: true,
  configSchema: incomingWebhookConfig,
  async execute(_input, _config, ctx) {
    return { output: ctx.triggerPayload ?? null };
  },
});
