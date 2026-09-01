"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { publishThemePackage, reviewThemePackage } from "@/app/actions/theme-packages";

interface ThemePackageSummary {
  id: string;
  title: string;
  caption: string | null;
  status: string;
  renderedAssetUrls: unknown;
  createdAt: Date | string;
}

function firstAsset(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const first = value[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "url" in first && typeof first.url === "string") return first.url;
}

export function ThemePackageQueue({ packages }: { packages: ThemePackageSummary[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string>();

  async function review(packageId: string, decision: "approve" | "reject") {
    setBusyId(packageId);
    try {
      const result = await reviewThemePackage(packageId, decision);
      if (result.error) throw new Error(result.error);
      toast.success(decision === "approve" ? "Package approved" : "Package rejected");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally {
      setBusyId(undefined);
    }
  }

  async function publish(packageId: string) {
    setBusyId(packageId);
    try {
      const result = await publishThemePackage(packageId);
      if (!result.success) throw new Error(result.error || "Publishing failed");
      toast.success(result.status === "published" ? "Package published" : "Package queued with Zernio");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publishing failed");
    } finally {
      setBusyId(undefined);
    }
  }

  if (packages.length === 0) {
    return <div className="p-6 text-center border border-dashed rounded-xl text-xs text-muted-foreground">No packages generated yet. Activate the recipe to stage the next daily mix.</div>;
  }

  return (
    <div className="space-y-3">
      {packages.map((pkg) => {
        const asset = firstAsset(pkg.renderedAssetUrls);
        const busy = busyId === pkg.id;
        return (
          <article key={pkg.id} className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[96px_1fr]">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-background">
              {asset ? <img src={asset} alt={`Preview for ${pkg.title}`} className="h-full w-full object-cover" /> : <span className="px-2 text-center text-[10px] text-muted-foreground">No rendered media</span>}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{pkg.title}</h3>
                  <p className="text-[11px] capitalize text-muted-foreground">{pkg.status.replaceAll("_", " ")} · {new Date(pkg.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              {pkg.caption ? <p className="line-clamp-3 text-xs text-muted-foreground">{pkg.caption}</p> : null}
              <div className="flex flex-wrap gap-2">
                {pkg.status === "pending_review" || pkg.status === "rejected" ? (
                  <>
                    <button type="button" disabled={busy || !asset} onClick={() => review(pkg.id, "approve")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">Approve</button>
                    <button type="button" disabled={busy} onClick={() => review(pkg.id, "reject")} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Reject</button>
                  </>
                ) : null}
                {pkg.status === "approved" ? (
                  <button type="button" disabled={busy} onClick={() => publish(pkg.id)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">Publish with Zernio</button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
