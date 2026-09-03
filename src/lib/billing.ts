import { db } from "@/lib/db";
import { tenants, themePages } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export interface TenantBillingLimits {
  isPro: boolean;
  plan: string | null;
  status: string | null;
  themePageLimit: number;
  slotLimitPerPage: number;
  allowsVideoRendering: boolean;
  allowsAutonomousCadence: boolean;
}

export async function checkUsageLimits(tenantId: string): Promise<TenantBillingLimits> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { subscriptionPlan: true, subscriptionStatus: true },
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const isPro =
    process.env.BILLING_TEST_BYPASS === "true" ||
    ((tenant.subscriptionPlan === "pro" || tenant.subscriptionPlan === "enterprise") &&
      tenant.subscriptionStatus === "active");

  return {
    isPro,
    plan: tenant.subscriptionPlan,
    status: tenant.subscriptionStatus,
    themePageLimit: isPro ? 100 : 1,
    slotLimitPerPage: isPro ? 24 : 3,
    allowsVideoRendering: isPro,
    allowsAutonomousCadence: isPro,
  };
}

export async function isProTenant(tenantId: string): Promise<boolean> {
  const limits = await checkUsageLimits(tenantId);
  return limits.isPro;
}

export async function requireProPlan(
  tenantId: string,
  featureName: string = "This action",
): Promise<boolean> {
  const limits = await checkUsageLimits(tenantId);
  if (!limits.isPro) {
    throw new Error(`${featureName} requires an active Pro subscription.`);
  }
  return true;
}

export async function assertThemePageQuota(tenantId: string): Promise<void> {
  const limits = await checkUsageLimits(tenantId);
  if (limits.isPro) return;

  const [res] = await db
    .select({ total: count() })
    .from(themePages)
    .where(eq(themePages.tenantId, tenantId));

  const total = res?.total ?? 0;
  if (total >= limits.themePageLimit) {
    throw new Error(
      `Free workspace limit reached (${limits.themePageLimit} Theme Page). Upgrade to Pro for unlimited theme pages.`,
    );
  }
}

