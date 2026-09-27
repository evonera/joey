import { describe, expect, it } from "vitest";
import { apiErrorResponse } from "@/lib/api-error-response";

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
});
