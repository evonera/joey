import * as React from "react";
import { getScouts } from "@/app/actions/scouts";
import { ScoutsClient } from "./scouts-client";
import { getActiveTenantId } from "@/lib/auth";
import { checkUsageLimits } from "@/lib/billing";

export default async function ScoutsPage() {
  const [initialScouts, limits] = await Promise.all([
    getScouts(),
    getActiveTenantId().then(checkUsageLimits),
  ]);

  return <ScoutsClient initialScouts={initialScouts as any[]} dailyMonitoringAllowed={limits.allowsAutonomousCadence} />;
}
