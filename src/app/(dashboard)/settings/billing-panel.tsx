"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getBillingSummary, openBillingPortal, startCheckout } from "@/app/actions/billing";
import { PricingTableOne } from "@/components/billingsdk/pricing-table-one";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Plan } from "@/lib/billingsdk-config";
import type { BillingPlan } from "@/lib/dodo";
import { PLAN_CATALOG } from "@/lib/plans";

const paidPlans: Array<Plan & { id: BillingPlan }> = [
  { id: "creator", title: "Creator", description: "For individual creators building a consistent publishing habit.", currency: "$", monthlyPrice: String(PLAN_CATALOG.creator.monthlyPrice), yearlyPrice: String(PLAN_CATALOG.creator.monthlyPrice * 12), buttonText: "Choose Creator", features: [
    { name: "3 connected accounts", icon: "check" }, { name: "3 theme pages", icon: "check" }, { name: "12 content slots per page", icon: "check" }, { name: "1 workspace", icon: "check" }, { name: "Standard video rendering", icon: "check" }, { name: "Scheduled automation", icon: "check" },
  ] },
  { id: "pro", title: "Pro", description: "For teams running a high-volume social content operation.", currency: "$", monthlyPrice: String(PLAN_CATALOG.pro.monthlyPrice), yearlyPrice: String(PLAN_CATALOG.pro.monthlyPrice * 12), buttonText: "Choose Pro", highlight: true, features: [
    { name: "8 connected accounts", icon: "check" }, { name: "8 theme pages", icon: "check" }, { name: "24 content slots per page", icon: "check" }, { name: "3 workspaces", icon: "check" }, { name: "Priority video queue", icon: "check" }, { name: "Team presence", icon: "check" },
  ] },
  { id: "agency", title: "Agency", description: "For agencies managing large, multi-brand publishing programs.", currency: "$", monthlyPrice: String(PLAN_CATALOG.agency.monthlyPrice), yearlyPrice: String(PLAN_CATALOG.agency.monthlyPrice * 12), buttonText: "Choose Agency", features: [
    { name: "15 connected accounts", icon: "check" }, { name: "20 theme pages", icon: "check" }, { name: "48 content slots per page", icon: "check" }, { name: "10 client workspaces", icon: "check" }, { name: "High-volume video rendering", icon: "check" }, { name: "Agency support", icon: "check" },
  ] },
];

export function BillingPanel() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getBillingSummary>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attempts = useRef<Partial<Record<BillingPlan, string>>>({});

  async function refresh() {
    setError(null);
    try { setSummary(await getBillingSummary()); }
    catch { setError("Couldn’t load billing. Please try again."); }
  }
  useEffect(() => { void refresh(); }, []);

  async function open(mode: "checkout" | "portal", plan?: BillingPlan) {
    setBusy(true);
    try {
      if (mode === "checkout" && !plan) throw new Error("Choose a billing plan.");
      if (plan) attempts.current[plan] ??= crypto.randomUUID();
      const result = mode === "checkout" ? await startCheckout(plan!, attempts.current[plan!]!) : await openBillingPortal();
      window.location.assign(result.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t open billing. Please try again.");
    } finally { setBusy(false); }
  }

  if (error) return <div role="alert" className="space-y-3"><p>{error}</p><Button onClick={refresh}>Try again</Button></div>;
  if (!summary) return <p role="status" className="text-muted-foreground">Loading billing…</p>;

  const selectablePlans = paidPlans.map((plan) => ({
    ...plan,
    buttonText: summary.plan === plan.id ? "Current plan" : summary.isPro ? "Change in billing portal" : plan.buttonText,
    disabled: summary.isPro || !summary.configured || !summary.canManage,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{summary.workspaceName} · {summary.isPro ? (summary.plan || "Paid") : "Free"}</CardTitle>
        <CardDescription>Billing applies to this workspace. {summary.status && `Subscription status: ${summary.status.replaceAll("_", " ")}.`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-semibold">Free</h3>
            <p className="text-sm text-muted-foreground">1 connected account, 1 theme page, 3 content slots, 3 AI generations, manual runs and review before publishing.</p>
        </div>
        <PricingTableOne
          plans={selectablePlans}
          title="Choose a workspace plan"
          description="Monthly plans with video rendering and scheduled automation. Upgrade or manage your subscription securely through Dodo Payments."
          onPlanSelect={(planId) => open("checkout", planId as BillingPlan)}
          showBillingCycleToggle={false}
          disabled={busy}
          size="small"
          className="py-2 md:py-4"
        />
        {!summary.configured ? <p className="text-sm text-muted-foreground">Billing is not available on this instance yet. Contact the administrator to enable paid plans.</p>
          : !summary.canManage ? <p className="text-sm text-muted-foreground">Ask a workspace owner or admin to manage your plan.</p>
          : <div className="flex flex-wrap gap-3">
              {summary.hasCustomer && <Button variant="outline" disabled={busy} onClick={() => open("portal")}>Manage billing</Button>}
              <Button variant="ghost" disabled={busy} onClick={refresh}>Refresh plan</Button>
            </div>}
        {summary.configured && summary.testMode && <p className="text-sm text-amber-600 dark:text-amber-400">Test checkout is enabled. No live payment will be collected.</p>}
        <p className="text-xs text-muted-foreground">After checkout, your plan updates when payment is confirmed. Use Manage billing for invoices, payment methods and cancellation.</p>
      </CardContent>
    </Card>
  );
}
