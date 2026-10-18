"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getBillingSummary, openBillingPortal, startCheckout } from "@/app/actions/billing";
import { PricingTableOne } from "@/components/billingsdk/pricing-table-one";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Plan } from "@/lib/billingsdk-config";
import type { BillingPlan } from "@/lib/dodo";
import Link from "next/link";
import { PLAN_CATALOG, planFeatures, getPlanDefinition } from "@/lib/plans";

const paidPlans: Array<Plan & { id: BillingPlan }> = (["creator", "pro", "agency"] as const).map((id) => ({
  id, title: PLAN_CATALOG[id].name,
  description: `Monthly billing for this workspace.`, currency: "$",
  monthlyPrice: String(PLAN_CATALOG[id].monthlyPrice), yearlyPrice: String(PLAN_CATALOG[id].monthlyPrice * 12),
  buttonText: `Choose ${PLAN_CATALOG[id].name}`, highlight: id === "pro",
  features: planFeatures(id).map(name => ({ name, icon: "check" as const })),
}));

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
    buttonText: summary.isPro && summary.plan === plan.id ? "Current plan" : summary.isPro ? "Change in billing portal" : plan.buttonText,
    disabled: summary.isPro || !summary.configured || !summary.canManage,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{summary.workspaceName} · {summary.isPro ? getPlanDefinition(summary.plan).name : "Free"}</CardTitle>
        <CardDescription>Billing applies to this workspace. {summary.status && `Subscription status: ${summary.status.replaceAll("_", " ")}.`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {summary.subscription && ["active", "past_due"].includes(summary.subscription.status) && <p className="text-sm">{summary.subscription.cancelAtPeriodEnd ? "Paid access ends" : "Next billing date"}: {new Date(summary.subscription.renewsAt).toLocaleDateString()}. {summary.subscription.cancelAtPeriodEnd && "Renewal is cancelled."}</p>}
        {summary.subscription?.scheduledPlan && summary.subscription.scheduledAt && <p className="text-sm">Plan changes to {summary.subscription.scheduledPlan} on {new Date(summary.subscription.scheduledAt).toLocaleDateString()}. Your current limits apply until then.</p>}
        {summary.providerUnavailable && <p role="status" className="text-sm text-muted-foreground">Couldn’t confirm the current renewal details. Open Manage billing for the latest status.</p>}
        {!summary.isPro && <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-semibold">Free</h3>
            <p className="text-sm text-muted-foreground">1 connected account, 1 theme page, 3 content slots, 3 AI generations, manual runs and review before publishing.</p>
        </div>}
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
        {summary.maintenance ? <p role="status" className="text-sm text-muted-foreground">Billing is being updated. Please try again shortly or contact joey@evonera.net.</p>
          : !summary.configured ? <p className="text-sm text-muted-foreground">Billing is not available on this instance yet. Contact the administrator to enable paid plans.</p>
          : !summary.canManage ? <p className="text-sm text-muted-foreground">Ask a workspace owner or admin to manage your plan.</p>
          : <div className="flex flex-wrap gap-3">
              {summary.hasCustomer && <Button variant="outline" disabled={busy} onClick={() => open("portal")}>Manage billing</Button>}
              <Button variant="ghost" disabled={busy} onClick={refresh}>Refresh plan</Button>
            </div>}
        {summary.configured && summary.testMode && <p className="text-sm text-amber-600 dark:text-amber-400">Test checkout is enabled. No live payment will be collected.</p>}
        <p className="text-xs text-muted-foreground">Prices are USD per workspace per month; taxes and local currency conversion are shown at checkout. Other workspaces are billed separately. Model API usage with your own keys is billed by your provider.</p>
        <p className="text-xs text-muted-foreground">After checkout, your plan updates when payment is confirmed. Use Manage billing for invoices, payment methods and cancellation.</p>
        <p className="text-xs text-muted-foreground">Plans renew automatically until cancelled. <Link href="/cancellation" className="underline">Cancellation</Link> · <Link href="/refunds" className="underline">7-day first-payment refunds</Link> · <Link href="/terms" className="underline">Terms</Link> · <a href="mailto:joey@evonera.net" className="underline">Billing support</a></p>
      </CardContent>
    </Card>
  );
}
