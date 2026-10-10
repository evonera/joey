"use client";

import { RenderControls } from "./RenderControls";
import { PackageReview } from "./PackageReview";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { publishThemePackage, reviewThemePackage } from "@/app/actions/theme-packages";
import { scoutFactReviewRequired } from "@/lib/scouts/fact-review";

interface ThemePackageSummary {
  id: string;
  title: string;
  caption: string | null;
  status: string;
  renderedAssetUrls: unknown;
  metrics?: unknown;
  provenance?: unknown;
  updatedAt: Date | string;
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
  const [factAcknowledgements, setFactAcknowledgements] = React.useState<Record<string, string>>({});

  async function review(packageId: string, decision: "approve" | "reject") {
    setBusyId(packageId);
    try {
      const acknowledged = factAcknowledgements[packageId];
      const result = await reviewThemePackage(packageId, decision, undefined, acknowledged ? { updatedAt: acknowledged } : undefined);
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
    return <div className="p-6 text-center border border-dashed rounded-xl text-xs text-muted-foreground">No posts generated yet. Add sources and content slots, then activate automation to create drafts.</div>;
  }

  return (
    <div className="space-y-3">
      {packages.map((pkg) => {
        const asset = firstAsset(pkg.renderedAssetUrls);
        const busy = busyId === pkg.id;
        const needsFactReview = scoutFactReviewRequired(pkg.provenance);
        const revision = pkg.updatedAt ? new Date(pkg.updatedAt).toISOString() : "";
        const acknowledged = Boolean(revision) && factAcknowledgements[pkg.id] === revision;
        const evidence = (pkg.provenance as { researchFacts?: Array<{ claim: string; corroborationStatus: string; evidence?: Array<{ sourceUrl: string; quote: string }> }> } | null)?.researchFacts;
        return (
          <article key={pkg.id} className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[96px_1fr]">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-background">
              {asset && /\.mp4(?:\?|$)/i.test(asset) ? <video src={asset} controls preload="metadata" className="h-full w-full object-contain" /> : asset ? <img src={asset} alt={`Preview for ${pkg.title}`} className="h-full w-full object-cover" /> : <span className="px-2 text-center text-[10px] text-muted-foreground">No rendered media</span>}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{pkg.title}</h3>
                  <p className="text-[11px] capitalize text-muted-foreground">{pkg.status.replaceAll("_", " ")} · {new Date(pkg.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              {pkg.caption ? <p className="line-clamp-3 text-xs text-muted-foreground">{pkg.caption}</p> : null}
              {needsFactReview && <details className="rounded-lg border p-3 text-xs">
                <summary className="cursor-pointer font-medium">Fact review required: claims are not independently corroborated</summary>
                <p className="my-2 text-muted-foreground">Compare the original sources and edit any uncertain claims before approving. Only corroborated claims appear as carousel takeaways.</p>
                {Array.isArray(evidence) && evidence.map((fact, index) => <div key={index} className="mb-3 space-y-1">
                  <p>{fact.claim} <span className="text-muted-foreground">({fact.corroborationStatus})</span></p>
                  {fact.evidence?.map((source, sourceIndex) => {
                    let url: URL; try { url = new URL(source.sourceUrl); } catch { return null; }
                    if (url.protocol !== "https:") return null;
                    return <blockquote key={sourceIndex} className="border-l pl-2 text-muted-foreground">{source.quote} <a href={url.toString()} target="_blank" rel="noopener noreferrer" className="underline">{url.hostname}</a></blockquote>;
                  })}
                </div>)}
                <label className="flex items-start gap-2"><input type="checkbox" checked={acknowledged} onChange={event => setFactAcknowledgements(previous => ({ ...previous, [pkg.id]: event.target.checked ? revision : "" }))} />I reviewed the sources and resolved uncertainty in this draft.</label>
              </details>}
              <div className="flex flex-wrap gap-2">
                <PackageReview pkg={pkg} />
                {["pending_review", "rejected", "failed"].includes(pkg.status) && <RenderControls packageId={pkg.id} hasFinishedMedia={Boolean(asset)} renderJobId={typeof (pkg.metrics as { renderJobId?: unknown } | null)?.renderJobId === "string" ? (pkg.metrics as { renderJobId: string }).renderJobId : undefined} />}
                {pkg.status === "pending_review" || pkg.status === "rejected" ? (
                  <>
                    <button type="button" disabled={busy || !asset || needsFactReview && !acknowledged} onClick={() => review(pkg.id, "approve")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">Approve</button>
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
