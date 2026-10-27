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
  return PLAN_CATALOG[plan && Object.hasOwn(PLAN_CATALOG, plan) ? (plan as PlanId) : "free"];
}

export const PUBLIC_PLAN_IDS = ["free", "creator", "pro", "agency"] as const;

export function planFeatures(plan: (typeof PUBLIC_PLAN_IDS)[number]): string[] {
  const p = PLAN_CATALOG[plan];
  return [
    `Up to ${p.maxConnectedAccounts} connected account${p.maxConnectedAccounts === 1 ? "" : "s"}`,
    `${p.themePageLimit} theme page${p.themePageLimit === 1 ? "" : "s"}`,
    `${p.slotLimitPerPage} content slots per page`,
    `Own up to ${p.maxWorkspaces} workspace${p.maxWorkspaces === 1 ? "" : "s"} (billed separately)`,
    ...(p.paid ? ["Video rendering", "Scheduled automation"] : ["3 included AI generations", "Manual runs and draft review"]),
  ];
}

// Dodo only emits past_due while a configured renewal grace period is open.
export function hasPaidPlanAccess(plan: string | null | undefined, status: string | null | undefined) {
  return getPlanDefinition(plan).paid && (status === "active" || status === "past_due");
}
