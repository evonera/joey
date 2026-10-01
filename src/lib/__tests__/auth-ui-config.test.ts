import { describe, expect, it } from "vitest";
import { getConfiguredSocialProviders } from "@/lib/auth-ui-config";

describe("auth social provider UI configuration", () => {
  it("offers Google only when both server credentials are configured", () => {
    expect(getConfiguredSocialProviders({ GOOGLE_CLIENT_ID: "id" })).toEqual([]);
    expect(getConfiguredSocialProviders({ GOOGLE_CLIENT_SECRET: "secret" })).toEqual([]);
    expect(getConfiguredSocialProviders({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" })).toEqual(["google"]);
  });
});
