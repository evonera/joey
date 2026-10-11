"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateThemePackageCopy } from "@/app/actions/theme-packages";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PackageReview({ pkg }: { pkg: { id: string; title: string; caption: string | null; status: string; renderedAssetUrls: unknown; provenance?: unknown; updatedAt: Date | string } }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(pkg.title);
  const [caption, setCaption] = useState(pkg.caption ?? "");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const provenance = (pkg.provenance ?? {}) as { sources?: Array<{ url?: string; title?: string; excerpt?: string; publishedAt?: string; discoveredAt?: string; rightsCategory?: string }>; selectedMedia?: { credit?: string; sourceUrl?: string; rightsCategory?: string } };
  const assets = Array.isArray(pkg.renderedAssetUrls) ? pkg.renderedAssetUrls.filter(item => item && typeof item.url === "string") as Array<{ url: string; type?: string; slideIndex?: number }> : [];
  const editable = ["pending_review", "rejected", "approved", "failed"].includes(pkg.status);
  return <>
    <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => { setTitle(pkg.title); setCaption(pkg.caption ?? ""); setOpen(true); }}>Review media and copy</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Review this post</DialogTitle><DialogDescription>Compare the finished exports and copy with the original sources. Saving edits returns the post to review.</DialogDescription></DialogHeader>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            {assets.length ? assets.map((asset, index) => <figure key={asset.url} className="rounded border p-2">
              {asset.type === "video" || /\.mp4(?:\?|$)/i.test(asset.url) ? <video src={asset.url} controls preload="metadata" className="max-h-[60vh] w-full object-contain" /> : <img src={asset.url} alt={`Finished export ${index + 1}`} className="max-h-[60vh] w-full object-contain" />}
              <figcaption className="mt-1 text-xs text-muted-foreground">{assets.length > 1 ? `Slide ${asset.slideIndex ?? index + 1} of ${assets.length}` : "Finished export"} · <a href={asset.url} target="_blank" rel="noreferrer" className="underline">Open full size</a></figcaption>
            </figure>) : <p className="rounded border p-4 text-sm">No finished media. Create an export before approval.</p>}
            {provenance.selectedMedia && <p className="text-xs">Image credit: {provenance.selectedMedia.credit} · {provenance.selectedMedia.rightsCategory?.replaceAll("_", " ")}</p>}
          </div>
          <div className="space-y-3">
            <label className="block text-sm">Headline<textarea disabled={!editable} value={title} maxLength={500} onChange={event => setTitle(event.target.value)} className="mt-1 min-h-24 w-full rounded border bg-background p-2" /></label>
            <label className="block text-sm">Caption<textarea disabled={!editable} value={caption} maxLength={10000} onChange={event => setCaption(event.target.value)} className="mt-1 min-h-48 w-full rounded border bg-background p-2" /></label>
            {editable && <button type="button" disabled={busy || !title.trim() || (title === pkg.title && caption === (pkg.caption ?? ""))} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={async () => {
              setBusy(true);
              try { const result = await updateThemePackageCopy(pkg.id, { title, caption, updatedAt: new Date(pkg.updatedAt).toISOString() }); if (result.error) throw new Error(result.error); toast.success("Copy saved. Review the updated post before approval."); setOpen(false); router.refresh(); }
              catch (error) { toast.error(error instanceof Error ? error.message : "Could not save copy"); } finally { setBusy(false); }
            }}>{busy ? "Saving…" : "Save copy"}</button>}
            <div className="space-y-3 border-t pt-3">
              <h4 className="text-sm font-semibold">Original sources</h4>
              {provenance.sources?.length ? provenance.sources.map((source, index) => <div key={`${source.url}-${index}`} className="space-y-1 text-xs">
                <p className="font-medium">{source.title ?? "Source article"}</p>
                {source.url && /^https?:\/\//i.test(source.url) && <a href={source.url} target="_blank" rel="noreferrer" className="block break-all underline">{source.url}</a>}
                {source.excerpt && <p className="whitespace-pre-wrap text-muted-foreground">{source.excerpt}</p>}
                <p>Published: {source.publishedAt ? new Date(source.publishedAt).toLocaleString() : "Unknown"}{source.discoveredAt ? ` · Discovered: ${new Date(source.discoveredAt).toLocaleString()}` : ""}</p>
                <p>Rights: {source.rightsCategory?.replaceAll("_", " ") ?? "Unknown"}</p>
              </div>) : <p className="text-xs text-muted-foreground">No source details attached.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
