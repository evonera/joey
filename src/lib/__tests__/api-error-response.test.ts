import { describe, expect, it } from "vitest";
import { apiErrorResponse } from "@/lib/api-error-response";
import { RateLimitError } from "@/lib/api-auth";

describe("public API error responses", () => {
  it.each([
    ["Invalid API token", 401],
    ["Insufficient scope: requires 'read'", 403],
    ["database connection lost", 500],
  ])("maps %s without exposing internal errors", async (message, expectedStatus) => {
    const response = apiErrorResponse(new Error(message));
    expect(response.status).toBe(expectedStatus);
    if (expectedStatus === 500) await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
  });

  it("includes retry guidance on a rate-limit response", () => {
    const resetAt = 1_800_000_000_000;
    const response = apiErrorResponse(new RateLimitError(resetAt));

    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).toBe(String(Math.ceil(resetAt / 1000)));
  });
});
