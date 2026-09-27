import { NextResponse } from "next/server";
import { RateLimitError, withRateLimitHeaders } from "@/lib/api-auth";

export function apiErrorResponse(error: unknown, rateLimit?: Parameters<typeof withRateLimitHeaders>[1]) {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const errorName = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  const isAuthenticationError = [
    "Unauthorized",
    "Missing or invalid Authorization header",
    "Missing token",
    "Invalid API token",
    "API token expired",
  ].includes(message);
  const status = errorName === "RateLimitError" ? 429
    : message.startsWith("Insufficient scope") || message.startsWith("Forbidden") ? 403
    : isAuthenticationError ? 401
    : 500;
  const safeMessage = status === 500 ? "Internal server error" : message;
  const response = NextResponse.json({ error: safeMessage }, { status });
  const errorRateLimit = error instanceof RateLimitError
    ? { remaining: 0, resetAt: error.resetAt }
    : undefined;
  const headers = rateLimit ?? errorRateLimit;
  return headers ? withRateLimitHeaders(response, headers) : response;
}
