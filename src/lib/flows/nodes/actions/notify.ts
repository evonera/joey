import { defineNode } from "../../node-contract";
import { notifyConfig } from "../../catalog";


const configSchema = notifyConfig;

export const notifyNode = defineNode({
  type: "action.notify",
  category: "action",
  label: "Notify me",
  description: "Sends you an in-app notification (and email if your preferences allow).",
  inputs: ["data"],
  outputs: ["data"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const { createNotification } = await import("@/lib/notifications");
    const config = configSchema.parse(rawConfig);

    const body = config.messageTemplate?.includes("{{input}}")
      ? config.messageTemplate.replaceAll("{{input}}", safeStringify(input))
      : (config.messageTemplate ?? safeStringify(input)).slice(0, 500);

    if (ctx.signal?.aborted) {
      throw (ctx.signal.reason as Error) ?? new Error("Aborted");
    }

    await createNotification(ctx.tenantId, "draft_ready", config.title, body, {
      link: `/flows/runs?runId=${ctx.runId}`,
      metadata: { flowRunId: ctx.runId },
    });

    return { output: input };
  },
});

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
