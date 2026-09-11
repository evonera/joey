import { db } from "@/lib/db";
import { tenants, themePages, socialAccounts, member } from "@/lib/db/schema";
import { eq, count, and } from "drizzle-orm";

export interface TenantBillingLimits {
  isPro: boolean;
  plan: string | null;
  status: string | null;
  themePageLimit: number;
  slotLimitPerPage: number;
  maxConnectedAccounts: number;
  maxWorkspaces: number;
  freeAiGenerations: number;
  allowsVideoRendering: boolean;
  allowsAutonomousCadence: boolean;
}

const PLAN_LIMITS = {
  free: { themePageLimit: 1, slotLimitPerPage: 3, maxConnectedAccounts: 1, maxWorkspaces: 1, freeAiGenerations: 3, paid: false },
  creator: { themePageLimit: 10, slotLimitPerPage: 12, maxConnectedAccounts: 3, maxWorkspaces: 1, freeAiGenerations: Infinity, paid: true },
  pro: { themePageLimit: 100, slotLimitPerPage: 24, maxConnectedAccounts: 8, maxWorkspaces: 3, freeAiGenerations: Infinity, paid: true },
  agency: { themePageLimit: 500, slotLimitPerPage: 48, maxConnectedAccounts: 15, maxWorkspaces: 10, freeAiGenerations: Infinity, paid: true },
  enterprise: { themePageLimit: 500, slotLimitPerPage: 48, maxConnectedAccounts: 50, maxWorkspaces: 50, freeAiGenerations: Infinity, paid: true },
} as const;

export async function checkUsageLimits(tenantId: string, runner: typeof db = db): Promise<TenantBillingLimits> {
  const tenant = await runner.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { subscriptionPlan: true, subscriptionStatus: true },
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const limits = PLAN_LIMITS[(tenant.subscriptionPlan || "free") as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
  const isPro =
    (process.env.NODE_ENV !== "production" && process.env.BILLING_TEST_BYPASS === "true") ||
    (limits.paid && tenant.subscriptionStatus === "active");

  return {
    isPro,
    plan: tenant.subscriptionPlan,
    status: tenant.subscriptionStatus,
    themePageLimit: isPro ? limits.themePageLimit : PLAN_LIMITS.free.themePageLimit,
    slotLimitPerPage: isPro ? limits.slotLimitPerPage : PLAN_LIMITS.free.slotLimitPerPage,
    maxConnectedAccounts: isPro ? limits.maxConnectedAccounts : PLAN_LIMITS.free.maxConnectedAccounts,
    maxWorkspaces: isPro ? limits.maxWorkspaces : PLAN_LIMITS.free.maxWorkspaces,
    freeAiGenerations: isPro ? limits.freeAiGenerations : PLAN_LIMITS.free.freeAiGenerations,
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

export async function assertThemePageQuota(
  tenantId: string,
  tx?: any,
): Promise<void> {
  const runner = tx || db;
  const limits = await checkUsageLimits(tenantId, runner);

  const [res] = await runner
    .select({ total: count() })
    .from(themePages)
    .where(eq(themePages.tenantId, tenantId));

  const total = res?.total ?? 0;
  if (total >= limits.themePageLimit) {
    throw new Error(
      `Workspace limit reached (${limits.themePageLimit} theme page${limits.themePageLimit === 1 ? "" : "s"}).${limits.isPro ? "" : " Upgrade to a paid plan for more theme pages."}`,
    );
  }
}

export async function assertAccountQuota(
  tenantId: string,
  tx?: any,
): Promise<void> {
  const runner = tx || db;
  const limits = await checkUsageLimits(tenantId, runner);

  const [res] = await runner
    .select({ total: count() })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true)));

  const total = res?.total ?? 0;
  if (total >= limits.maxConnectedAccounts) {
    throw new Error(
      `Workspace limit reached (${limits.maxConnectedAccounts} connected account${limits.maxConnectedAccounts === 1 ? "" : "s"}).${limits.isPro ? "" : " Upgrade to a paid plan to connect more accounts."}`,
    );
  }
}

export async function assertWorkspaceQuota(
  userId: string,
  runner: typeof db = db,
): Promise<void> {
  const ownedMembers = await runner.query.member.findMany({
    where: and(eq(member.userId, userId), eq(member.role, "owner")),
  });

  let maxAllowed: number = PLAN_LIMITS.free.maxWorkspaces;
  let hasPaid = false;

  for (const m of ownedMembers) {
    const tenant = await runner.query.tenants.findFirst({
      where: eq(tenants.id, m.organizationId),
      columns: { subscriptionPlan: true, subscriptionStatus: true },
    });
    if (tenant?.subscriptionStatus === "active") {
      const plan = PLAN_LIMITS[(tenant.subscriptionPlan || "free") as keyof typeof PLAN_LIMITS];
      if (plan?.paid) {
        hasPaid = true;
        maxAllowed = Math.max(maxAllowed, plan.maxWorkspaces);
      }
    }
  }

  if (ownedMembers.length >= maxAllowed) {
    throw new Error(
      `Workspace limit reached (${maxAllowed} workspace${maxAllowed === 1 ? "" : "s"}).${hasPaid ? "" : " Free accounts are limited to 1 workspace. Upgrade to Pro to create more workspaces."}`
    );
  }
}
