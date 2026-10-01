"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const staleBundle = /ChunkLoadError|Failed to load chunk|Loading chunk|\/_next\/static\/immutable\/chunks\//i.test(`${error.name} ${error.message}`);
  return (
    <div role="alert" className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">This page couldn’t load</h1>
      <p className="text-muted-foreground">{staleBundle ? "Joey has a newer version. Reload to continue creating." : "Try again. If the problem continues, check Operations for service errors."}</p>
      <Button onClick={staleBundle ? () => window.location.reload() : reset}>{staleBundle ? "Reload Joey" : "Try again"}</Button>
    </div>
  );
}
