import { defineNode } from "../../node-contract";
import { incomingWebhookTriggerConfig } from "../../catalog";

export function unwrapIncomingWebhookPayload(triggerPayload: unknown): unknown {
  const envelope = triggerPayload as { payload?: unknown } | null;
  return envelope?.payload ?? triggerPayload ?? null;
}

export const incomingWebhookTriggerNode = defineNode({
  type: "trigger.incoming_webhook",
  category: "trigger",
  label: "Incoming webhook",
  description: "Starts this flow from its authenticated public webhook endpoint.",
  inputs: [],
  outputs: ["payload"],
  isTrigger: true,
  configSchema: incomingWebhookTriggerConfig,
  async execute(_input, _config, ctx) {
    return { output: unwrapIncomingWebhookPayload(ctx.triggerPayload) };
  },
});
