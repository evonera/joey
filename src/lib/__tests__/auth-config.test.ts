import { describe, it, expect } from "vitest";
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

  it("includes required plugins: organization and dodopayments", () => {
    const plugins = auth.options.plugins || [];
    const pluginIds = plugins.map((p: any) => p.id);
    expect(pluginIds).toContain("organization");
    expect(pluginIds).toContain("dodopayments");
  });

  it("enables Google social provider and disables GitHub", () => {
    const socialProviders = auth.options.socialProviders;
    expect(socialProviders).toBeDefined();
    expect(socialProviders?.google).toBeDefined();
    expect(socialProviders?.google?.clientId).toBeDefined();
    expect(socialProviders?.google?.clientSecret).toBeDefined();
    expect((socialProviders as any)?.github).toBeUndefined();
  });
});
