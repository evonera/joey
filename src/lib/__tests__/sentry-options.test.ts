import { describe, expect, it } from "vitest";
import { getSentryOptions } from "@/lib/sentry-options";

describe("Sentry options", () => {
  it("stays disabled without a DSN", () => {
    expect(getSentryOptions(undefined)).toMatchObject({
      enabled: false,
      sendDefaultPii: false,
    });
  });

  it("enables privacy-safe monitoring when a DSN is configured", () => {
    expect(getSentryOptions("https://public@example.ingest.sentry.io/1")).toMatchObject({
      dsn: "https://public@example.ingest.sentry.io/1",
      enabled: true,
      sendDefaultPii: false,
    });
  });
});
