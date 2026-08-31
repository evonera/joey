import { defineNode } from "../../node-contract";
import { telegramSendConfig } from "../../catalog";
import { enqueueTelegramMessage, telegramOutboxKey } from "@/lib/telegram-outbox";

export const telegramSendNode = defineNode({
  type: "action.telegram_send", category: "action", label: "Send Telegram", description: "Queues an idempotent Telegram message through Joey's durable outbox.",
  inputs: ["data"], outputs: ["message"], configSchema: telegramSendConfig,
  async execute(input, rawConfig, ctx) {
    const config = telegramSendConfig.parse(rawConfig);
    const text = config.messageTemplate.replaceAll("{{input}}", typeof input === "string" ? input : JSON.stringify(input));
    if (text.length > 4096) {
      throw new Error(`Telegram message exceeds 4096 characters (${text.length} chars).`);
    }
    const queued = await enqueueTelegramMessage({ tenantId: ctx.tenantId, idempotencyKey: telegramOutboxKey(ctx), chatId: config.chatId, text });
    return { output: { outboxId: queued.id, status: queued.status, text } };
  },
});
