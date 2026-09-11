import { manualPostSchema, validatePostForPlatforms } from "@/lib/compose-validation";
import { defineNode } from "../../node-contract";
import { createDraftConfig } from "../../catalog";

const configSchema = createDraftConfig;

export const createDraftNode = defineNode({
  type: "action.create_draft",
  category: "action",
  label: "Create Draft",
  description:
    "Creates a post in Drafts for review. Choose a connected account before publishing.",
  inputs: ["data"],
  outputs: ["draft"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);

    let content =
      (config.contentField && textField(input, config.contentField)) ??
      (typeof input === "string" ? input : undefined);

    const mediaUrls: string[] = [];
    if (input && typeof input === "object" && input !== null) {
      const record = input as Record<string, unknown>;
      if (!content) {
        if (typeof record.caption === "string") {
          content = record.caption.trim();
        } else if (typeof record.content === "string") {
          content = record.content.trim();
        } else if (typeof record.text === "string") {
          content = record.text.trim();
        } else if (typeof record.message === "string") {
          content = record.message.trim();
        }
      }
      if (config.mediaUrlField) {
        const extracted = extractField(input, config.mediaUrlField);
        if (Array.isArray(extracted)) {
          for (const url of extracted) {
            if (typeof url !== "string") throw new Error("Media URLs must be strings.");
            if (url.trim()) mediaUrls.push(url.trim());
          }
        } else if (typeof extracted === "string" && extracted.trim()) {
          mediaUrls.push(extracted.trim());
        } else if (extracted != null) {
          throw new Error("The media field must contain a URL or an array of URLs.");
        }
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

    if (!content || !content.trim()) {
      throw new Error("No content to draft — incoming data was empty.");
    }

    content = content.trim();
    manualPostSchema.shape.mediaUrls.parse(mediaUrls);
    const platformError = validatePostForPlatforms(content, mediaUrls, [config.platform]);
    if (platformError) throw new Error(platformError);

    if (ctx.signal?.aborted) {
      throw (ctx.signal.reason as Error) ?? new Error("Aborted");
    }

    const { db } = await import("@/lib/db");
    const { drafts, flowRuns, socialAccounts } = await import("@/lib/db/schema");
    const { eq, and, inArray, sql } = await import("drizzle-orm");

    const draft = await db.transaction(async (tx) => {
      if (ctx.runId) {
        const [lockedRun] = await tx
          .select({ id: flowRuns.id })
          .from(flowRuns)
          .where(and(eq(flowRuns.id, ctx.runId), eq(flowRuns.tenantId, ctx.tenantId), eq(flowRuns.status, "running")))
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

      const accounts = await tx.query.socialAccounts.findMany({
        where: and(
          eq(socialAccounts.tenantId, ctx.tenantId), eq(socialAccounts.isActive, true),
          inArray(socialAccounts.platform, config.platform === "twitter" ? ["x", "twitter"] : [config.platform]),
          config.accountId ? eq(socialAccounts.id, config.accountId) : undefined,
        ),
        columns: { id: true },
        limit: 2,
      });
      if (config.accountId && accounts.length !== 1) throw new Error("Choose an active account in this workspace that matches the draft platform.");
      const accountId = accounts.length === 1 ? accounts[0].id : undefined;

      const [inserted] = await tx
        .insert(drafts)
        .values({
          tenantId: ctx.tenantId,
          content,
          status: "pending_review",
          platformOptions: {
            platform: config.platform,
            ...(accountId ? { accountId } : {}),
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

function extractField(input: unknown, path: string): unknown {
  const value = path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), input);
  return value;
}

function textField(input: unknown, path: string): string | undefined {
  const value = extractField(input, path);
  return typeof value === "string" ? value : undefined;
}
