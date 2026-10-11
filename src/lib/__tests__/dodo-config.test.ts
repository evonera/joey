import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBillingConfig } from "../dodo";

describe("Billing mode credentials", () => {
  beforeEach(() => {
    vi.stubEnv("DODO_PAYMENTS_API_KEY", "test-api");
    vi.stubEnv("DODO_PAYMENTS_WEBHOOK_SECRET", "test-signing");
    vi.stubEnv("DODO_LIVE_API_KEY", "live-api");
    vi.stubEnv("DODO_LIVE_WEBHOOK_SECRET", "live-signing");
    for (const plan of ["CREATOR", "PRO", "AGENCY"]) vi.stubEnv(`DODO_${plan}_PRODUCT_ID`, plan);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("preserves test credentials while live values are staged", () => {
    vi.stubEnv("DODO_PAYMENTS_ENVIRONMENT", "test_mode");
    expect(getBillingConfig()).toMatchObject({ apiKey: "test-api", webhookKey: "test-signing", configured: true });
  });
  it("selects the live API and signing keys together on activation", () => {
    vi.stubEnv("DODO_PAYMENTS_ENVIRONMENT", "live_mode");
    expect(getBillingConfig()).toMatchObject({ apiKey: "live-api", webhookKey: "live-signing", configured: true });
  });
  it.each(["DODO_LIVE_API_KEY", "DODO_LIVE_WEBHOOK_SECRET"])("fails closed when %s is missing from the live pair", key => {
    vi.stubEnv("DODO_PAYMENTS_ENVIRONMENT", "live_mode");
    vi.stubEnv(key, "");
    expect(getBillingConfig().configured).toBe(false);
  });
});
