import { defineNode } from "../../node-contract";
import { approvalGateConfig } from "../../catalog";

const configSchema = approvalGateConfig;

export const approvalGateNode = defineNode({
  type: "logic.approval",
  category: "logic",
  label: "Approval gate",
  description:
    "Pauses the run until you approve or reject in the dashboard. On approve, downstream nodes execute; on reject the run ends.",
  inputs: ["data"],
  outputs: ["data"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);
    if (ctx.approvedNodeIds?.includes(ctx.nodeId)) {
      return { output: input };
    }
    return {
      output: input,
      waitForApproval: { prompt: config.prompt },
    };
  },
});
