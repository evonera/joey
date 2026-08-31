type OperationalValue = string | number | boolean | null | undefined;
type OperationalContext = Record<string, OperationalValue>;

const SENSITIVE_KEY = /authorization|cookie|payload|secret|token|password|text/i;

export function sanitizeOperationalContext(context: OperationalContext): Record<string, Exclude<OperationalValue, undefined>> {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([key, value]) => value !== undefined && !SENSITIVE_KEY.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 500) : value]),
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
