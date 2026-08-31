import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getTenantOperationalHealth } from "@/app/actions/operations";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const health = await getTenantOperationalHealth();
  const signals = [
    ["Failed flow runs", health.flowFailures24h, "Last 24 hours"],
    ["Stale running flows", health.staleFlowRuns, "No heartbeat for 30 minutes"],
    ["Failed webhook deliveries", health.webhookFailures24h, "Last 24 hours"],
    ["Stale webhook deliveries", health.staleWebhookDeliveries, "Processing for over 10 minutes"],
    ["Due R2 cleanup tasks", health.cleanupDue, "Ready for the cleanup worker"],
    ["Repeated cleanup failures", health.cleanupRepeatedFailures, "Three or more attempts"],
    ["Delayed Telegram messages", health.telegramPending, "Pending for over 5 minutes"],
    ["Uncertain Telegram sends", health.telegramUncertain, "Requires operator review before replay"],
  ] as const;
  const hasIssues = signals.some(([, value]) => value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Operations</h1>
          <p className="text-sm text-muted-foreground">Tenant-scoped delivery, execution, and cleanup health.</p>
        </div>
        <Badge variant={hasIssues ? "destructive" : "secondary"} className="gap-1">
          {hasIssues ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}
          {hasIssues ? "Attention required" : "Healthy"}
        </Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {signals.map(([label, value, description]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl">{value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{description}</CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Updated {new Date(health.generatedAt).toLocaleString()}</p>
    </div>
  );
}
