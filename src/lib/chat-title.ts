/** Delimit UI-generated context so ordinary bracketed prose isn't stripped.
 * This is a display marker only, never an authorization/approval boundary. */
export function messageWithChatContext(text: string, context: string): string {
  return context.trim() ? `[Joey context v1]\n${context.trim()}\n[/Joey context]\n${text}`.trim() : text.trim();
}

export function userPromptText(message: string): string {
  return message
    .replace(/^\[Joey context v1\]\r?\n[\s\S]*?\r?\n\[\/Joey context\](?:\r?\n|$)/, "")
    .replace(/\s+/g, " ")
    .trim();
}
