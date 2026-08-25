import { z } from "zod";
import { defineNode } from "../../node-contract";
import { scheduleTriggerConfig } from "../../catalog";

const configSchema = scheduleTriggerConfig;

export type ScheduleTriggerConfig = z.infer<typeof configSchema>;

export const scheduleTriggerNode = defineNode({
  type: "trigger.schedule",
  category: "trigger",
  label: "Schedule",
  description: "Runs the flow on a fixed interval while the flow is active.",
  inputs: [],
  outputs: ["data"],
  isTrigger: true,
  configSchema,
  async execute(_input, config, ctx) {
    return { output: ctx.triggerPayload ?? null };
  },
});

/** Whether a schedule-trigger flow is due given its last run time. */
export function isScheduleDue(
  config: ScheduleTriggerConfig,
  lastRunAt: Date | null,
): boolean {
  if (!lastRunAt) return true;
  const elapsedMs = Date.now() - lastRunAt.getTime();
  return elapsedMs >= config.intervalMinutes * 60_000;
}
