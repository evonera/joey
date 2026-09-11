"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { cancelMediaRender, getMediaRender, retryMediaRender } from "@/app/actions/media";
import { getThemeRenderSetup, renderThemePackage } from "@/app/actions/theme-packages";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function RenderControls({ packageId, renderJobId }: { packageId: string; renderJobId?: string }) {
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof getThemeRenderSetup>>>();
  const [assetId, setAssetId] = useState("");
  const [musicId, setMusicId] = useState("");
  const [cropX, setCropX] = useState(.5);
  const [cropY, setCropY] = useState(.5);
  const [insetId, setInsetId] = useState("");
  const [duration, setDuration] = useState(15);
  const [sourceDuration, setSourceDuration] = useState<number | null>(null);
  const [start, setStart] = useState(0);
  const [crop, setCrop] = useState<"contain" | "cover">("contain");
  const [captions, setCaptions] = useState(false);
  const [minimal, setMinimal] = useState(false);
  const router = useRouter();
  const [activeJob, setActiveJob] = useState(renderJobId);
  const [canRetry, setCanRetry] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const [renderStatus, setRenderStatus] = useState<string>();

  useEffect(() => {
    if (!assetId || !setup?.video) {
      setSourceDuration(null);
      return;
    }
    const asset = setup.assets.find(a => a.id === assetId) as { publicUrl?: string } | undefined;
    if (!asset?.publicUrl) return;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = asset.publicUrl;
    const onLoaded = () => {
      const dur = Math.round(video.duration);
      if (Number.isFinite(dur) && dur > 0) {
        setSourceDuration(dur);
        setDuration(prev => (prev > dur || prev === 15 ? Math.min(dur, 60) : prev));
      }
    };
    video.addEventListener("loadedmetadata", onLoaded);
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.src = "";
    };
  }, [assetId, setup]);
  useEffect(() => setActiveJob(renderJobId), [renderJobId]);
  useEffect(() => {
    if (!activeJob) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const job = await getMediaRender(activeJob!);
        if (stopped) return;
        setRenderStatus(job.status);
        setCanRetry(job.canRetry);
        if (["queued", "rendering"].includes(job.status)) timer = setTimeout(poll, 3000);
        else router.refresh();
      } catch { if (!stopped) setRenderStatus("Status unavailable"); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [activeJob, router, pollVersion]);
  return <>
    {activeJob && canRetry && <button type="button" disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs" onClick={async () => {
      setBusy(true);
      try { const job = await retryMediaRender(activeJob); setRenderStatus(job.status); setCanRetry(false); setPollVersion(value => value + 1); router.refresh(); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Could not retry render"); } finally { setBusy(false); }
    }}>Retry render</button>}
    {renderStatus && <span role="status" className="text-xs text-muted-foreground">Render: {renderStatus}</span>}
    {activeJob && ["queued", "rendering"].includes(renderStatus ?? "") && <button type="button" disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs" onClick={async () => {
      setBusy(true);
      try { const job = await cancelMediaRender(activeJob); setRenderStatus(job.status); setCanRetry(job.canRetry); router.refresh(); }
      catch { toast.error("Could not cancel render"); } finally { setBusy(false); }
    }}>Cancel render</button>}
    <button type="button" disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50" onClick={async () => {
      setBusy(true);
      try { const value = await getThemeRenderSetup(packageId); setSetup(value); setAssetId(value.assets[0]?.id ?? ""); setCrop(value.video ? "contain" : "cover"); }
      catch { toast.error("Could not load render settings"); } finally { setBusy(false); }
    }}>Render media</button>
    <Dialog open={Boolean(setup)} onOpenChange={open => { if (!open) setSetup(undefined); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Render finished media</DialogTitle><DialogDescription>Choose an uploaded source, then review the exported file before approving this post.</DialogDescription></DialogHeader>
        {!setup?.enabled ? <p>The media worker is not enabled for this installation yet.</p> : <>
          <label className="text-sm">Source asset<select className="mt-1 w-full rounded border bg-background p-2" value={assetId} onChange={e => setAssetId(e.target.value)}><option value="">Choose an asset</option>{setup.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>
          {!setup.assets.length && <Link href="/assets" className="text-sm underline">Upload source media in Assets</Link>}
          <label className="text-sm">Image placement<select className="mt-1 w-full rounded border bg-background p-2" value={crop} onChange={e => setCrop(e.target.value as "contain" | "cover")}><option value="contain">Fit entire source</option><option value="cover">Fill frame and crop edges</option></select></label>
          {crop === "cover" && <>
            <label className="text-sm">Horizontal crop focus<input aria-label="Horizontal crop focus" type="range" min={0} max={1} step={.05} value={cropX} onChange={e => setCropX(Number(e.target.value))} className="w-full" /></label>
            <label className="text-sm">Vertical crop focus<input aria-label="Vertical crop focus" type="range" min={0} max={1} step={.05} value={cropY} onChange={e => setCropY(Number(e.target.value))} className="w-full" /></label>
          </>}
          {setup.video ? <>
            <label className="text-sm">Optional background music<select className="mt-1 w-full rounded border bg-background p-2" value={musicId} onChange={e => setMusicId(e.target.value)}><option value="">No music</option>{setup.music.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={captions} onChange={e => setCaptions(e.target.checked)} />Generate timed captions using your workspace OpenAI key</label>
            <label className="text-sm">Clip starts at (seconds)<input type="number" min={0} max={86400} value={start} onChange={e => setStart(Number(e.target.value))} className="ml-2 w-24 rounded border bg-background p-2" /></label>
            <label className="text-sm">Duration (seconds){sourceDuration ? ` (source: ${sourceDuration}s)` : ""}<input type="number" min={1} max={sourceDuration ? Math.max(1, sourceDuration) : 60} value={duration} onChange={e => setDuration(Number(e.target.value))} className="ml-2 w-24 rounded border bg-background p-2" /></label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={minimal} onChange={e => setMinimal(e.target.checked)} />Minimal layout without account header</label>
          </> : <label className="text-sm">Optional inset image<select className="mt-1 w-full rounded border bg-background p-2" value={insetId} onChange={e => setInsetId(e.target.value)}><option value="">No inset</option>{setup.images.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>}
          <button disabled={busy || !assetId} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={async () => {
            setBusy(true);
            try { const job = await renderThemePackage(packageId, { mediaAssetId: assetId, ...(!setup.video && insetId ? { insetAssetId: insetId } : {}), templateFamily: setup.video ? minimal ? "minimal_meme" : "branded_clip" : insetId ? "photo_inset" : "photo_headline", ...(setup.video && musicId ? { musicAssetId: musicId } : {}), captions: setup.video && captions, cropX, cropY, cropMode: crop, durationSeconds: duration, trimStart: start, zoom: 1 }); toast.success(job.status === "succeeded" ? "Render ready" : "Render queued"); setActiveJob(job.jobId); setRenderStatus(job.status); setSetup(undefined); router.refresh(); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Could not queue render"); } finally { setBusy(false); }
          }}>{busy ? "Queuing…" : "Create export"}</button>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
