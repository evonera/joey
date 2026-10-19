// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.check }));

import { consumeYoutubeRequest, YoutubeQuotaError } from "../youtube-quota";

const HOUR = 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 19);
const KEY = "youtube-private-api-key";
let counters: Map<string, number>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  mocks.check.mockReset();
  counters = new Map();
  mocks.check.mockImplementation(async (bucket: string, limit: number, windowMs: number) => {
    const window = Math.floor(Date.now() / windowMs) * windowMs;
    const id = `${bucket}:${window}`;
    const count = (counters.get(id) ?? 0) + 1;
    counters.set(id, count);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: window + windowMs };
  });
});
afterEach(() => vi.useRealTimers());

describe("YouTube durable request admission", () => {
  it("allows normal channel/retry attempts without persisting plaintext credentials or workspace IDs", async () => {
    for (let attempt = 0; attempt < 9; attempt++) await consumeYoutubeRequest("workspace-private-id", KEY);
    expect(mocks.check).toHaveBeenCalledTimes(27);
    for (const [bucket] of mocks.check.mock.calls) {
      expect(bucket).not.toContain(KEY);
      expect(bucket).not.toContain("workspace-private-id");
      expect(bucket).toMatch(/^youtube-api:[a-f0-9]{64}:(?:workspace:[a-f0-9]{64}:)?(?:hour|day)$/);
    }
  });

  it("blocks the 31st workspace attempt before touching shared capacity, then admits in the next hour", async () => {
    for (let attempt = 0; attempt < 30; attempt++) await consumeYoutubeRequest("workspace", KEY);
    mocks.check.mockClear();
    await expect(consumeYoutubeRequest("workspace", KEY)).rejects.toMatchObject({ scope: "workspace_hour", resetAt: START + HOUR });
    expect(mocks.check).toHaveBeenCalledTimes(1);
    vi.setSystemTime(START + HOUR);
    await expect(consumeYoutubeRequest("workspace", KEY)).resolves.toBeUndefined();
  });

  it("allows 288 channel API attempts over a 15-minute daily run but caps the workspace at 400/day", async () => {
    for (let hour = 0; hour < 24; hour++) {
      vi.setSystemTime(START + hour * HOUR);
      for (let attempt = 0; attempt < 12; attempt++) await consumeYoutubeRequest("workspace", KEY);
    }
    // Use a separate workspace for the exact hard-cap boundary.
    for (let attempt = 0; attempt < 400; attempt++) {
      vi.setSystemTime(START + Math.floor(attempt / 30) * HOUR);
      await consumeYoutubeRequest("daily-limit-workspace", KEY);
    }
    await expect(consumeYoutubeRequest("daily-limit-workspace", KEY)).rejects.toMatchObject({ scope: "workspace_day", resetAt: START + 24 * HOUR });
    vi.setSystemTime(START + 24 * HOUR);
    await expect(consumeYoutubeRequest("daily-limit-workspace", KEY)).resolves.toBeUndefined();
  });

  it("shares the 250/hour credential allowance across tenants and isolates a different credential", async () => {
    for (let attempt = 0; attempt < 250; attempt++) await consumeYoutubeRequest(`workspace-${Math.floor(attempt / 25)}`, KEY);
    await expect(consumeYoutubeRequest("new-workspace", KEY)).rejects.toBeInstanceOf(YoutubeQuotaError);
    await expect(consumeYoutubeRequest("new-workspace", KEY)).rejects.toMatchObject({ scope: "credential_hour" });
    await expect(consumeYoutubeRequest("new-workspace", "different-private-key")).resolves.toBeUndefined();
  });

  it("fails closed with a sanitized error if durable admission storage fails", async () => {
    mocks.check.mockRejectedValue(new Error(`database failed with ${KEY}`));
    await expect(consumeYoutubeRequest("workspace", KEY)).rejects.toThrow("allowance could not be checked");
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it("rejects missing workspace or malformed credentials before accessing storage", async () => {
    await expect(consumeYoutubeRequest(" ", KEY)).rejects.toThrow("workspace");
    for (const key of ["", "bad key", "x".repeat(513)]) await expect(consumeYoutubeRequest("workspace", key)).rejects.toThrow("credential");
    expect(mocks.check).not.toHaveBeenCalled();
  });
});
