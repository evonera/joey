import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export type Cursor = { createdAt: Date; id: string };

/**
 * PostgreSQL timestamps retain microseconds, while JavaScript Date cursors
 * retain only milliseconds. Normalize the database sort key to milliseconds
 * so rows sharing a JS timestamp are ordered and paged by the id tie-breaker
 * instead of being skipped by a precision mismatch.
 */
export function cursorTimestamp(column: AnyPgColumn) {
  return sql<Date>`date_trunc('milliseconds', ${column})`;
}

export function parsePageRequest(params: URLSearchParams):
  | { ok: true; limit: number; cursor: Cursor | null }
  | { ok: false; error: string } {
  const rawLimit = params.get("limit");
  let limit = DEFAULT_PAGE_SIZE;
  if (rawLimit !== null) {
    if (!/^\d{1,3}$/.test(rawLimit)) return { ok: false, error: "limit must be an integer from 1 to 100" };
    limit = Number(rawLimit);
    if (limit < 1 || limit > MAX_PAGE_SIZE) return { ok: false, error: "limit must be an integer from 1 to 100" };
  }

  const rawCursor = params.get("cursor");
  if (!rawCursor) return { ok: true, limit, cursor: null };
  if (rawCursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) return { ok: false, error: "cursor is invalid" };
  try {
    const parsed: unknown = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("invalid cursor");
    const { createdAt, id } = parsed as { createdAt?: unknown; id?: unknown };
    if (typeof createdAt !== "string" || typeof id !== "string" || id.length < 1 || id.length > 128) throw new Error("invalid cursor");
    const date = new Date(createdAt);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== createdAt) throw new Error("invalid cursor");
    return { ok: true, limit, cursor: { createdAt: date, id } };
  } catch {
    return { ok: false, error: "cursor is invalid" };
  }
}

export function makeNextCursor(row: { createdAt: Date; id: string } | undefined): string | null {
  if (!row) return null;
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }), "utf8").toString("base64url");
}
