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

    let content =
      (config.contentField && extractField(input, config.contentField)) ??
      (typeof input === "string" ? input : undefined);

    const mediaUrls: string[] = [];
    if (input && typeof input === "object") {
      const record = input as Record<string, unknown>;
      if (!content) {
        if (typeof record.caption === "string" && record.caption.trim()) {
          content = record.caption.trim();
        } else if (typeof record.content === "string" && record.content.trim()) {
          content = record.content.trim();
        } else if (typeof record.text === "string" && record.text.trim()) {
          content = record.text.trim();
        } else if (typeof record.message === "string" && record.message.trim()) {
          content = record.message.trim();
        } else if (!record.imageUrl && !record.url && !record.mediaUrls) {
          content = JSON.stringify(input);
        }
      }
      if (config.mediaUrlField) {
        const extracted = extractField(input, config.mediaUrlField);
        if (extracted) mediaUrls.push(extracted);
      } else {
        if (typeof record.imageUrl === "string" && record.imageUrl.trim()) {
          mediaUrls.push(record.imageUrl.trim());
        } else if (typeof record.url === "string" && record.url.trim() && /\.(?:png|jpe?g|webp|gif|mp4|mov)$/i.test(record.url)) {
          mediaUrls.push(record.url.trim());
        } else if (Array.isArray(record.mediaUrls)) {
          for (const item of record.mediaUrls) {
            if (typeof item === "string" && item.trim()) mediaUrls.push(item.trim());
          }
        }
      }
    }

    if (!content && mediaUrls.length > 0) {
      content = "";
    }

    if (content === undefined || (content === "" && mediaUrls.length === 0)) {
      throw new Error("No content to draft — incoming data was empty.");
    }

    if (ctx.signal?.aborted) {
      throw (ctx.signal.reason as Error) ?? new Error("Aborted");
    }

    const { db } = await import("@/lib/db");
    const { drafts, flowRuns } = await import("@/lib/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");

    const draft = await db.transaction(async (tx) => {
      if (ctx.runId) {
        const [lockedRun] = await tx
          .select({ id: flowRuns.id })
          .from(flowRuns)
          .where(and(eq(flowRuns.id, ctx.runId), eq(flowRuns.status, "running")))
          .for("update");
        if (!lockedRun) {
          throw new Error("Execution fenced: flow run is no longer running.");
        }
      }

      if (ctx.runId && ctx.nodeId) {
        const itemKey = ctx.itemKey ?? "root";
        const existing = await tx.query.drafts.findFirst({
          where: and(
            eq(drafts.tenantId, ctx.tenantId),
            sql`${drafts.platformOptions}->>'flowRunId' = ${ctx.runId}`,
            sql`${drafts.platformOptions}->>'nodeId' = ${ctx.nodeId}`,
            sql`${drafts.platformOptions}->>'itemKey' = ${itemKey}`,
          ),
        });
        if (existing) return existing;
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
            ...(mediaUrls.length > 0 ? { mediaUrls } : {}),
            source: "flow",
            flowRunId: ctx.runId,
            nodeId: ctx.nodeId,
            itemKey: ctx.itemKey ?? "root",
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
