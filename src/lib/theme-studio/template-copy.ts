export function applyDesignCopy(value: unknown, fallback: string, tokens: Record<string, string>): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => tokens[key] ?? match);
}
