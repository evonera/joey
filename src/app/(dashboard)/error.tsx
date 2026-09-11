"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">This page couldn’t load</h1>
      <p className="text-muted-foreground">Try again. If the problem continues, check Operations for service errors.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
