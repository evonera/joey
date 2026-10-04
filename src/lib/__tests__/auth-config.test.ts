import { describe, it, expect, vi } from "vitest";
import type { BetterAuthPlugin } from "better-auth";
import { auth } from "@/lib/auth";

describe("Better Auth Configuration", () => {
  it("configures baseURL properly without undefined warnings", () => {
    expect(auth.options.baseURL).toBeDefined();
    expect(typeof auth.options.baseURL).toBe("string");
    expect(auth.options.baseURL).toContain("http");
  });

  it("registers the organization and tenants model mappings in the database adapter", async () => {
    const ctx = await (auth as any).$context;
    expect(ctx).toBeDefined();
    expect(ctx.tables).toBeDefined();
    expect(ctx.tables.organization).toBeDefined();

    // Verify the adapter has registered schemas for both 'organization' and 'tenants'
    const schema = (auth.options.database as any)?.schema;
    if (schema) {
      expect(schema.organization).toBeDefined();
      expect(schema.tenants).toBeDefined();
      expect(schema.organization).toBe(schema.tenants);
    }
  });

  it("includes organization and registers billing webhooks only when configured", () => {
    const plugins = auth.options.plugins || [];
    const pluginIds = plugins.map((p: any) => p.id);
    expect(pluginIds).toContain("organization");
    expect(pluginIds.includes("dodopayments")).toBe(Boolean(process.env.DODO_PAYMENTS_WEBHOOK_SECRET || process.env.DODO_PAYMENTS_WEBHOOK_KEY));
    expect(pluginIds.at(-1)).toBe("next-cookies");
  });

  it("registers Google only when both credentials are present and disables GitHub", () => {
    const socialProviders = auth.options.socialProviders;
    expect(socialProviders).toBeDefined();
    expect(Boolean(socialProviders?.google)).toBe(Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET));
    expect((socialProviders as any)?.github).toBeUndefined();
  });

  it("encrypts stored OAuth tokens and never disables rate limiting in production", () => {
    expect(auth.options.account?.encryptOAuthTokens).toBe(true);
    expect(auth.options.rateLimit?.enabled).toBe(process.env.NODE_ENV === "production" || process.env.JOEY_E2E !== "1");
  });

  it("enables signed billing webhooks without adding a user customer schema or hooks", async () => {
    vi.stubEnv("DODO_PAYMENTS_WEBHOOK_SECRET", "whsec_dGVzdC1vbmx5LWtleQ==");
    vi.resetModules();
    try {
      const { auth: configuredAuth } = await import("@/lib/auth");
      const billingPlugin: BetterAuthPlugin | undefined = configuredAuth.options.plugins?.find((plugin) => plugin.id === "dodopayments");
      expect(billingPlugin).toBeDefined();
      expect(billingPlugin?.schema).toBeUndefined();
      expect(billingPlugin?.init).toBeUndefined();
      expect(billingPlugin?.endpoints?.dodopaymentsWebhooks).toBeDefined();
      // Force Better Auth's adapter schema validation with billing enabled.
      await expect(configuredAuth.$context).resolves.toBeDefined();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
