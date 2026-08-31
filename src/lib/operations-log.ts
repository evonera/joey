type OperationalValue = string | number | boolean | null | undefined;
type OperationalContext = Record<string, OperationalValue>;

const SENSITIVE_KEY = /authorization|cookie|payload|secret|token|password|text/i;

export function sanitizeOperationalString(value: string): string {
  let text = value;
  text = text.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");
  text = text.replace(/(token|secret|password|apikey|auth|authorization|cookie)\s*[:=]\s*["']?[^"'\s,;]+["']?/gi, "$1=[REDACTED]");
  text = text.replace(/(https?:\/\/)([^:]+):([^@]+)@/gi, "$1[REDACTED]:[REDACTED]@");
  return text.slice(0, 500);
}

export function sanitizeOperationalContext(context: OperationalContext): Record<string, Exclude<OperationalValue, undefined>> {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([key, value]) => value !== undefined && !SENSITIVE_KEY.test(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? sanitizeOperationalString(value) : value,
      ]),
  ) as Record<string, Exclude<OperationalValue, undefined>>;
}

export function operationalEvent(
  level: "info" | "warn" | "error",
  event: string,
  context: OperationalContext = {},
): void {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeOperationalContext(context),
  });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.info(record);
}
