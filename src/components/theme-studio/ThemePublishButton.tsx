"use client";

import { useState } from "react";
import { toast } from "sonner";
import { prepareThemePublication, publishConfirmedThemePackage, reconcileThemePublication } from "@/app/actions/theme-publication-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Preview = Extract<Awaited<ReturnType<typeof prepareThemePublication>>, { preview: unknown }>["preview"];
export function ThemePublishButton({ packageId, publishEarly = false, onComplete, disabled = false, allowReconcile = false, reconcileOnly = false }: { packageId: string; publishEarly?: boolean; onComplete: () => void; disabled?: boolean; allowReconcile?: boolean; reconcileOnly?: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  async function prepare() {
    setBusy(true);
    try {
      const result = await prepareThemePublication(packageId, publishEarly);
      if (!("preview" in result)) throw new Error(result.error || "Could not prepare publication.");
      setPreview(result.preview);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not prepare publication."); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await publishConfirmedThemePackage(packageId, preview.publishEarly, preview.fingerprint);
      if (!result.success) throw new Error(result.error || "Publishing failed.");
      setPreview(null);
      toast.success(result.status === "published" ? "Package published" : "Package submitted to Zernio");
      onComplete();
    } catch (error) { setPreview(null); toast.error(error instanceof Error ? error.message : "Publishing failed."); }
    finally { setBusy(false); }
  }
  async function reconcile() {
    setBusy(true);
    try {
      const result = await reconcileThemePublication(packageId);
      if (result.error) throw new Error(result.error);
      toast.success("Publication status checked."); onComplete();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not check publication."); }
    finally { setBusy(false); }
  }
  return <>
    {!reconcileOnly && <Button size="sm" disabled={busy || disabled} onClick={prepare}>{publishEarly ? "Publish Early" : "Publish with Zernio"}</Button>}
    {(allowReconcile || reconcileOnly) && <Button size="sm" variant="outline" disabled={busy || disabled} onClick={reconcile}>Check existing post</Button>}
    <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open && !busy) setPreview(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Confirm publication</DialogTitle><DialogDescription>Review the post and destinations before sending.</DialogDescription></DialogHeader>
        {preview && <div className="space-y-3 text-sm">
          <div><strong>Title:</strong> {preview.payload.title}</div>
          <div><strong>Accounts:</strong> {preview.accounts.map(a => `${a.accountName || a.id} (${a.platform})`).join(", ")}</div>
          <div role="region" aria-label="Post content" tabIndex={0} className="max-h-40 overflow-auto whitespace-pre-wrap rounded border p-3">{preview.payload.content}</div>
          {preview.payload.platforms.map(item => <div key={item.accountId}><strong>{preview.accounts.find(a => a.platformAccountId === item.accountId)?.accountName || item.accountId}:</strong><p className="max-h-32 overflow-auto whitespace-pre-wrap rounded border p-2" tabIndex={0}>{item.customContent}</p></div>)}
          <div><strong>Hashtags:</strong> {preview.payload.hashtags.join(" ") || "None"}</div>
          <div><strong>Media:</strong> {preview.payload.mediaItems.map((item, index) => <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" className="ml-2 underline">{item.type} {index + 1}</a>)}</div>
          <div>{"scheduledFor" in preview.payload ? `Scheduled for ${new Date(preview.payload.scheduledFor).toLocaleString()}` : "Publishes immediately"}</div>
        </div>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button><Button disabled={busy} onClick={publish}>Confirm</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
