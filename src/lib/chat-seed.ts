/** Global creation seeds belong to Joey chat, never a scoped agency persona. */
export function consumeChatSeed(storage: Pick<Storage, "getItem" | "removeItem">, personaId?: string): string | undefined {
  if (personaId) return;
  const raw = storage.getItem("joey_seed_prompt");
  if (!raw) return;
  storage.removeItem("joey_seed_prompt");
  const seed: unknown = JSON.parse(raw);
  if (typeof seed !== "object" || seed === null) return;
  const { prompt, autoSend } = seed as Record<string, unknown>;
  return autoSend === true && typeof prompt === "string" && prompt.trim() ? prompt : undefined;
}
