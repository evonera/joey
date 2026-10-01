/** Remove only Joey's leading display metadata, not brackets in user prose. */
export function userPromptText(message: string): string {
  return message
    .replace(/^(?:\[(?:Active Sources|Target Channels):[^\r\n]*\]\s*\r?\n)+/, "")
    .replace(/\s+/g, " ")
    .trim();
}
