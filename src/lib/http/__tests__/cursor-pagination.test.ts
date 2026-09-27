import { describe, expect, it } from "vitest";
import { makeNextCursor, parsePageRequest } from "../cursor-pagination";

describe("cursor pagination", () => {
  it("defaults to 50 and caps accepted page sizes at 100", () => {
    expect(parsePageRequest(new URLSearchParams())).toMatchObject({ ok: true, limit: 50, cursor: null });
    expect(parsePageRequest(new URLSearchParams("limit=100"))).toMatchObject({ ok: true, limit: 100 });
    expect(parsePageRequest(new URLSearchParams("limit=101"))).toMatchObject({ ok: false });
  });

  it("round-trips a stable timestamp and id cursor", () => {
    const cursor = makeNextCursor({ id: "item-1", createdAt: new Date("2026-09-23T10:00:00.000Z") });
    expect(parsePageRequest(new URLSearchParams(`cursor=${cursor}`))).toMatchObject({
      ok: true,
      cursor: { id: "item-1", createdAt: new Date("2026-09-23T10:00:00.000Z") },
    });
  });

  it("rejects malformed and oversized cursors", () => {
    expect(parsePageRequest(new URLSearchParams("cursor=not-valid-json"))).toMatchObject({ ok: false });
    expect(parsePageRequest(new URLSearchParams(`cursor=${"a".repeat(513)}`))).toMatchObject({ ok: false });
  });
});
