import crypto from "crypto";
import { defineNode } from "../../node-contract";
import { telegramApprovalConfig } from "../../catalog";

function template(text: string, input: unknown): string {
  if (!text.includes("{{input}}")) return text;
  const asText = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  return text.replaceAll("{{input}}", asText);
}

export const telegramApprovalNode = defineNode({
  type: "logic.telegram_approval",
  category: "logic",
  label: "Telegram approval",
  description: "Sends Approve/Reject buttons to your Telegram and pauses the run until you tap one.",
  inputs: ["data"],
  outputs: ["data"],
  configSchema: telegramApprovalConfig,
  async execute(input, rawConfig, ctx) {
    const config = telegramApprovalConfig.parse(rawConfig);
    const { telegramApi } = await import("@/lib/telegram");
    const { db } = await import("@/lib/db");
    const { telegramPendingApprovals } = await import("@/lib/db/schema");

    const nonce = crypto.randomBytes(12).toString("hex");

    // Record before sending so the callback can never race ahead of us.
    await db.insert(telegramPendingApprovals).values({
      nonce,
      tenantId: ctx.tenantId,
      runId: ctx.runId,
      nodeId: ctx.nodeId,
      chatId: config.chatId,
    });

    const result = await telegramApi<{ message_id?: number }>(ctx.tenantId, "sendMessage", {
      chat_id: config.chatId,
      text: template(config.prompt, input).slice(0, 3500),
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `fa:${nonce}` },
            { text: "❌ Reject", callback_data: `fr:${nonce}` },
          ],
        ],
      },
    });

    if (result?.message_id) {
      await db
        .update(telegramPendingApprovals)
        .set({ messageId: result.message_id })
        .where(
          (
            await import("drizzle-orm")
          ).eq(telegramPendingApprovals.nonce, nonce),
        );
    }

    return { output: input, waitForApproval: { prompt: config.prompt } };
  },
});
