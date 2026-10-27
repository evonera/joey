import Link from "next/link";
import { Alert02Icon as AlertTriangle, CheckmarkCircle02Icon as CheckCircle2, ArrowRight01Icon as ArrowRight } from "hugeicons-react";
import { getTenantOperationalHealth, listUncertainPrivateReplies } from "@/app/actions/operations";
import { UncertainPrivateReplies } from "@/components/uncertain-private-replies";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const [health, uncertainReplies] = await Promise.all([getTenantOperationalHealth(), listUncertainPrivateReplies()]);
  const signals = [
    { label: "Failed Scout evaluations", value: health.scoutFailures24h, description: "Last 24 hours; inspect Scout run history", href: "/scouts" },
    { label: "Uncertain Scout outcomes", value: health.scoutUncertain, description: "Review interrupted collection before retrying", href: "/scouts" },
    { label: "Blocked active Scouts", value: health.blockedScouts, description: "Paid access or source acquisition is unavailable", href: "/scouts" },
    { label: "Scouts beyond readiness scan", value: health.scoutReadinessUnchecked, description: "This page checks the first 100 active Scouts; review remaining sources", href: "/scouts" },
    { label: "Overdue active Scouts", value: health.overdueScouts, description: "Poll interval plus 15 minutes without a check", href: "/scouts" },
    { label: "Failed media renders", value: health.renderFailures24h, description: "Last 24 hours; inspect draft media errors", href: "/drafts?tab=failed" },
    { label: "Stalled media renders", value: health.stalledRenders, description: "Queued or rendering without progress for 30 minutes", href: "/drafts?tab=all" },
    { label: "Failed content packages or posts", value: health.publicationFailures, description: "Includes preparation and publication failures", href: "/drafts?tab=failed" },
    { label: "Unconfirmed overdue publications", value: health.pendingPublications, description: "Publishing for 30 minutes past the expected publication time", href: "/drafts?tab=publishing" },
    { label: "Failed agency runs", value: health.agencyFailures24h, description: "Last 24 hours; inspect agent history", href: "/agents" },
    { label: "Failed flow runs", value: health.flowFailures24h, description: "Last 24 hours", href: "/flows" },
    { label: "Stale running flows", value: health.staleFlowRuns, description: "No heartbeat for 30 minutes", href: "/flows" },
    { label: "Failed webhook deliveries", value: health.webhookFailures24h, description: "Last 24 hours", href: "/flows" },
    { label: "Stale webhook deliveries", value: health.staleWebhookDeliveries, description: "Processing for over 10 minutes", href: "/flows" },
    { label: "Due R2 cleanup tasks", value: health.cleanupDue, description: "Ready for the cleanup worker", href: "/assets" },
    { label: "Repeated cleanup failures", value: health.cleanupRepeatedFailures, description: "Three or more attempts", href: "/assets" },
    { label: "Delayed Telegram messages", value: health.telegramPending, description: "Pending for over 5 minutes", href: "/settings?tab=apps" },
    { label: "Unconfirmed private replies", value: health.privateRepliesUncertain, description: "Check the social provider before sending another reply", href: "/engagement" },
    { label: "Uncertain Telegram sends", value: health.telegramUncertain, description: "Requires operator review before replay", href: "/settings?tab=apps" },
  ];
  const hasIssues = signals.some((s) => s.value > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Operations</h1>
          <p className="text-sm text-muted-foreground">Workspace monitoring, creation, publication, delivery, and cleanup signals.</p>
        </div>
        <Badge variant={hasIssues ? "destructive" : "secondary"} className="gap-1">
          {hasIssues ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}
          {hasIssues ? "Attention required" : "No issues in monitored signals"}
        </Badge>
      </div>
      <UncertainPrivateReplies initial={uncertainReplies} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {signals.map((signal) => (
          <Link key={signal.label} href={signal.href} className="group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xl">
            <Card className="h-full hover:border-primary/50 transition-colors shadow-xs">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs">{signal.label}</CardDescription>
                  {signal.value > 0 && (
                    <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </div>
                <CardTitle className={`text-3xl font-mono ${signal.value > 0 ? "text-destructive" : "text-foreground"}`}>
                  {signal.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{signal.description}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">These database signals do not verify upstream provider availability or confirm that every scheduled worker is running. Updated {new Date(health.generatedAt).toLocaleString()}</p>
    </div>
  );
}
