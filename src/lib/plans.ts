export const PLAN_CATALOG = {
  free: {
    name: "Free",
    monthlyPrice: 0,
    themePageLimit: 1,
    slotLimitPerPage: 3,
    maxConnectedAccounts: 1,
    maxWorkspaces: 1,
    freeAiGenerations: 3,
    paid: false,
  },
  creator: {
    name: "Creator",
    monthlyPrice: 19,
    themePageLimit: 3,
    slotLimitPerPage: 12,
    maxConnectedAccounts: 3,
    maxWorkspaces: 1,
    freeAiGenerations: Infinity,
    paid: true,
  },
  pro: {
    name: "Pro",
    monthlyPrice: 59,
    themePageLimit: 8,
    slotLimitPerPage: 24,
    maxConnectedAccounts: 8,
    maxWorkspaces: 3,
    freeAiGenerations: Infinity,
    paid: true,
  },
  agency: {
    name: "Agency",
    monthlyPrice: 149,
    themePageLimit: 20,
    slotLimitPerPage: 48,
    maxConnectedAccounts: 15,
    maxWorkspaces: 10,
    freeAiGenerations: Infinity,
    paid: true,
  },
  enterprise: {
    name: "Enterprise",
    monthlyPrice: null,
    themePageLimit: 500,
    slotLimitPerPage: 48,
    maxConnectedAccounts: 50,
    maxWorkspaces: 50,
    freeAiGenerations: Infinity,
    paid: true,
  },
} as const;

export type PlanId = keyof typeof PLAN_CATALOG;

export function getPlanDefinition(plan: string | null | undefined) {
  return PLAN_CATALOG[plan && plan in PLAN_CATALOG ? (plan as PlanId) : "free"];
}
