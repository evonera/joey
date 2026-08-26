import { defineNode } from "../../node-contract";
import { createDraftConfig } from "../../catalog";

const configSchema = createDraftConfig;

export const createDraftNode = defineNode({
  type: "action.create_draft",
  category: "action",
  label: "Create Draft",
  description:
    "Creates a draft in your approval queue. Nothing publishes until you approve it — this is how every flow must end.",
  inputs: ["data"],
  outputs: ["draft"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);

    const content =
      (config.contentField && extractField(input, config.contentField)) ??
      (typeof input === "string" ? input : JSON.stringify(input));

    if (!content || !content.trim()) {
      throw new Error("No content to draft — incoming data was empty.");
    }

    if (ctx.signal?.aborted) {
      throw (ctx.signal.reason as Error) ?? new Error("Aborted");
    }

    const { db } = await import("@/lib/db");
    const { drafts, flowRuns } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");

    const draft = await db.transaction(async (tx) => {
      if (ctx.runId) {
        const run = await tx.query.flowRuns.findFirst({
          where: and(eq(flowRuns.id, ctx.runId), eq(flowRuns.status, "running")),
          columns: { id: true },
        });
        if (!run) {
          throw new Error("Execution fenced: flow run is no longer running.");
        }
      }

      const [inserted] = await tx
        .insert(drafts)
        .values({
          tenantId: ctx.tenantId,
          content,
          status: "pending_review",
          platformOptions: {
            platform: config.platform,
            ...(config.accountId ? { accountId: config.accountId } : {}),
            source: "flow",
            flowRunId: ctx.runId,
          },
        })
        .returning();
      return inserted;
    });

    return { output: { draftId: draft.id, status: draft.status } };
  },
});

function extractField(input: unknown, path: string): string | undefined {
  const value = path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), input);
  return value === undefined || value === null ? undefined : String(value);
}
