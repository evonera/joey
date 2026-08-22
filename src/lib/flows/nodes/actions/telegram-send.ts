import { defineNode } from "../../node-contract";
import { telegramSendConfig } from "../../catalog";

function template(text: string, input: unknown): string {
  if (!text.includes("{{input}}")) return text;
  const asText = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  return text.replaceAll("{{input}}", asText);
}

export const telegramSendNode = defineNode({
  type: "action.telegram_send",
  category: "action",
  label: "Telegram send",
  description: "Sends a message to a Telegram chat via your bot.",
  inputs: ["data"],
  outputs: ["data"],
  configSchema: telegramSendConfig,
  async execute(input, rawConfig, ctx) {
    const config = telegramSendConfig.parse(rawConfig);
    const { telegramApi } = await import("@/lib/telegram");

    await telegramApi(ctx.tenantId, "sendMessage", {
      chat_id: config.chatId,
      text: template(config.messageTemplate, input).slice(0, 4000),
      ...(config.parseMode ? { parse_mode: config.parseMode } : {}),
    });

    return { output: input };
  },
});
