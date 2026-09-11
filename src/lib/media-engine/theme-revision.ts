import { createHash } from "node:crypto";

type JsonRecord = Record<string, unknown>;

/**
 * PostgreSQL jsonb does not retain source object-key order. Canonicalizing the
 * render input before hashing keeps a revision stable when settings make a
 * round trip through jsonb or arrive from a differently ordered form payload.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toJSON();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function themePackageRenderRevision(input: {
  title: string;
  component: JsonRecord;
  brand: JsonRecord;
  name: string;
  format: string;
}) {
  return createHash("sha256").update(JSON.stringify(canonicalize(input))).digest("hex");
}
