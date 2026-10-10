"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { cancelMediaRender, getMediaRender, retryMediaRender } from "@/app/actions/media";
import { getThemeRenderSetup, renderThemePackage, selectThemeSourceMedia } from "@/app/actions/theme-packages";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { maximumTrimDuration, trimError } from "@/lib/media-engine/trim";
import { TimelineEditor } from "./TimelineEditor";

export function RenderControls({ packageId, renderJobId, hasFinishedMedia = false }: { packageId: string; renderJobId?: string; hasFinishedMedia?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof getThemeRenderSetup>>>();
  const [assetId, setAssetId] = useState("");
  const [musicId, setMusicId] = useState("");
  const [cropX, setCropX] = useState(.5);
  const [cropY, setCropY] = useState(.5);
  const [insetOverride, setInsetOverride] = useState(false);
  const [insetId, setInsetId] = useState("");
  const [duration, setDuration] = useState(15);
  const [sourceDuration, setSourceDuration] = useState<number | null>(null);
  const [start, setStart] = useState(0);
  const [crop, setCrop] = useState<"contain" | "cover">("contain");
  const [captions, setCaptions] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sourceAudio, setSourceAudio] = useState(true);
  const [minimal, setMinimal] = useState(false);
  const [timelineMode, setTimelineMode] = useState(false);
  const router = useRouter();
  const [activeJob, setActiveJob] = useState(renderJobId);
  const [canRetry, setCanRetry] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const [renderStatus, setRenderStatus] = useState<string>();

  useEffect(() => {
    setSourceDuration(null);
    const restoredStart = assetId === setup?.settings?.mediaAssetId ? Number(setup.settings.trimStart ?? 0) : 0;
    setStart(restoredStart);
    setDuration(assetId === setup?.settings?.mediaAssetId ? Number(setup.settings.durationSeconds ?? 15) : 15);
    if (!assetId || !setup?.video) {
      setSourceDuration(null);
      return;
    }
    const asset = setup.assets.find(a => a.id === assetId) as { publicUrl?: string } | undefined;
    if (!asset?.publicUrl) return;
    const video = document.createElement("video");
    video.preload = "metadata";
    const onLoaded = () => {
      const dur = video.duration;
      if (Number.isFinite(dur) && dur > 0) {
        setSourceDuration(dur);
        setStart(prev => Math.min(prev, Math.max(0, dur - 1)));
        setDuration(prev => Math.min(prev, Math.max(1, dur - restoredStart), 60));
      }
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.src = asset.publicUrl;
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.src = "";
    };
  }, [assetId, setup]);
  const maxDuration = maximumTrimDuration(start, sourceDuration);
  const rangeError = setup?.video ? trimError(start, duration, sourceDuration) : null;
  useEffect(() => setActiveJob(renderJobId), [renderJobId]);
  useEffect(() => {
    if (!renderJobId) setRenderStatus(hasFinishedMedia ? "succeeded" : undefined);
  }, [renderJobId, hasFinishedMedia]);
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
      try {
        const value = await getThemeRenderSetup(packageId);
        const saved = value.settings;
        setSetup(value); setInsetOverride(false);
        setAssetId(typeof saved.mediaAssetId === "string" ? saved.mediaAssetId : value.assets.find(asset => typeof (value.video ? saved.videoUrl : saved.bgImageUrl) === "string" && asset.publicUrl === (value.video ? saved.videoUrl : saved.bgImageUrl))?.id ?? "");
        setInsetId(saved.insetEnabled === false ? "" : typeof saved.insetAssetId === "string" ? saved.insetAssetId : value.images.find(asset => typeof saved.pipInsetUrl === "string" && asset.publicUrl === saved.pipInsetUrl)?.id ?? "");
        setMusicId(typeof saved.musicAssetId === "string" ? saved.musicAssetId : "");
        setCrop(saved.cropMode === "cover" ? "cover" : saved.cropMode === "contain" ? "contain" : value.video ? "contain" : "cover");
        setCropX(Number(saved.cropX ?? .5)); setCropY(Number(saved.cropY ?? .5));
        setDuration(Number(saved.durationSeconds ?? 15)); setStart(Number(saved.trimStart ?? 0));
        setCaptions(saved.captions === true); setMinimal(saved.templateFamily === "minimal_meme");
        setZoom(Number(saved.zoom ?? 1)); setSourceAudio(saved.sourceAudio !== false);
      }
      catch { toast.error("Could not load render settings"); } finally { setBusy(false); }
    }}>Render media</button>
    <Dialog open={Boolean(setup)} onOpenChange={open => { if (!open) setSetup(undefined); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Render finished media</DialogTitle><DialogDescription>Choose an uploaded source, then review the exported file before approving this post.</DialogDescription></DialogHeader>
        {setup?.storageReady === false && <p className="text-sm">Asset storage is not connected. Connect it before importing images or creating exports.</p>}
        {setup?.candidates?.length ? <div className="grid grid-cols-2 gap-2">{setup.candidates.map(candidate => <button key={candidate.url} type="button" disabled={busy || setup.storageReady === false} className="rounded border p-2 text-left text-xs" onClick={async () => {
          setBusy(true);
          try { const selected = await selectThemeSourceMedia(packageId, candidate.url); const next = await getThemeRenderSetup(packageId); setSetup(next); setAssetId(selected.assetId); router.refresh(); }
          catch (error) { toast.error(error instanceof Error ? error.message : "Could not import source image"); } finally { setBusy(false); }
        }}><img src={candidate.url} alt={`Source image from ${candidate.credit}`} className="mb-1 h-24 w-full object-contain" />{candidate.credit} · {candidate.rightsCategory.replaceAll("_", " ")}</button>)}</div> : null}
        {!setup?.enabled ? <div className="space-y-2"><p className="text-sm">{setup?.video ? "Video exports are not enabled for this workspace." : "Export the saved template and selected source image."}</p><button type="button" disabled={busy || setup?.video || setup?.storageReady === false} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={async () => {
          setBusy(true); try { await renderThemePackage(packageId); toast.success("Export ready"); setSetup(undefined); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Export failed"); } finally { setBusy(false); }
        }}>{busy ? "Rendering…" : "Create export"}</button></div> : <>
          {setup.timelineEnabled && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={timelineMode} onChange={e => setTimelineMode(e.target.checked)} />Use multiple scenes</label>}
          {timelineMode && setup.timelineEnabled ? <TimelineEditor videos={setup.assets} images={setup.images} music={setup.music} sfxEnabled={setup.sfxEnabled} initialSound={setup.savedSound} initialScenes={setup.savedTimeline} busy={busy} onExport={async (timeline, sound) => {
            setBusy(true);
            try { const job = await renderThemePackage(packageId, { timeline, ...sound, templateFamily: "branded_clip" }); setActiveJob(job.jobId); setRenderStatus(job.status); setSetup(undefined); toast.success("Timeline render queued"); router.refresh(); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Could not queue timeline"); } finally { setBusy(false); }
          }} /> : <>
          <label className="text-sm">Source asset<select className="mt-1 w-full rounded border bg-background p-2" value={assetId} onChange={e => setAssetId(e.target.value)}><option value="">Choose an asset</option>{setup.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>
          {assetId && <div className="max-h-64 overflow-hidden rounded border bg-black" style={{ aspectRatio: setup.video ? minimal ? "1000/900" : "960/1000" : (setup.aspectRatio ?? "4:5").replace(":", "/") }}>
            {setup.video ? <video key={assetId} src={setup.assets.find(asset => asset.id === assetId)?.publicUrl} controls preload="metadata" className="h-full w-full" style={{ objectFit: crop, objectPosition: `${cropX * 100}% ${cropY * 100}%` }} /> : <img src={setup.assets.find(asset => asset.id === assetId)?.publicUrl} alt="Selected source and crop" className="h-full w-full" style={{ objectFit: crop, objectPosition: `${cropX * 100}% ${cropY * 100}%` }} />}
          </div>}
          {!setup.assets.length && <Link href="/assets" className="text-sm underline">Upload source media in Assets</Link>}
          <label className="text-sm">Image placement<select className="mt-1 w-full rounded border bg-background p-2" value={crop} onChange={e => setCrop(e.target.value as "contain" | "cover")}><option value="contain">Fit entire source</option><option value="cover">Fill frame and crop edges</option></select></label>
          {crop === "cover" && <>
            <label className="text-sm">Horizontal crop focus<input aria-label="Horizontal crop focus" type="range" min={0} max={1} step={.05} value={cropX} onChange={e => setCropX(Number(e.target.value))} className="w-full" /></label>
            <label className="text-sm">Vertical crop focus<input aria-label="Vertical crop focus" type="range" min={0} max={1} step={.05} value={cropY} onChange={e => setCropY(Number(e.target.value))} className="w-full" /></label>
          </>}
          {setup.video ? <>
            <label className="text-sm">Optional background music<select className="mt-1 w-full rounded border bg-background p-2" value={musicId} onChange={e => setMusicId(e.target.value)}><option value="">No music</option>{setup.music.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={captions} onChange={e => setCaptions(e.target.checked)} />Generate timed captions using your workspace OpenAI key</label>
            <label className="text-sm">Clip starts at (seconds)<input type="number" min={0} max={sourceDuration === null ? 86400 : Math.max(0, Math.min(86400, sourceDuration - 1))} step="any" value={Number.isFinite(start) ? start : ""} onChange={e => {
              const nextStart = e.target.valueAsNumber;
              setStart(nextStart);
              const remaining = maximumTrimDuration(nextStart, sourceDuration);
              if (remaining >= 1) setDuration(value => Math.min(value, remaining));
            }} className="ml-2 w-24 rounded border bg-background p-2" /></label>
            <label className="text-sm">Duration (seconds){sourceDuration !== null ? ` (source: ${sourceDuration}s)` : ""}<input type="number" min={1} max={maxDuration} step="any" value={Number.isFinite(duration) ? duration : ""} onChange={e => setDuration(e.target.valueAsNumber)} className="ml-2 w-24 rounded border bg-background p-2" /></label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={sourceAudio} onChange={e => setSourceAudio(e.target.checked)} />Keep source audio</label>
            <label className="text-sm">Zoom<input type="range" min={1} max={1.15} step={.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-full" /></label>
            {rangeError && <p role="alert" className="text-sm text-destructive">{rangeError}</p>}
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={minimal} onChange={e => setMinimal(e.target.checked)} />Minimal layout without account header</label>
          </> : <label className="text-sm">Optional inset image<select className="mt-1 w-full rounded border bg-background p-2" value={insetId} onChange={e => { setInsetOverride(true); setInsetId(e.target.value); }}><option value="">No inset</option>{setup.images.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>}
          <button disabled={busy || setup.storageReady === false || (setup.video && !assetId) || Boolean(rangeError)} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={async () => {
            if (setup.video && trimError(start, duration, sourceDuration)) return;
            setBusy(true);
            try { const job = await renderThemePackage(packageId, assetId ? { mediaAssetId: assetId, ...(!setup.video && insetOverride ? { insetEnabled: Boolean(insetId) } : {}), ...(!setup.video && insetId ? { insetAssetId: insetId } : {}), templateFamily: setup.video ? minimal ? "minimal_meme" : "branded_clip" : insetId ? "photo_inset" : "photo_headline", ...(setup.video && musicId ? { musicAssetId: musicId } : {}), captions: setup.video && captions, cropX, cropY, cropMode: crop, durationSeconds: duration, trimStart: start, zoom, sourceAudio } : undefined); toast.success(job.status === "succeeded" ? "Render ready" : "Render queued"); setActiveJob(job.jobId); setRenderStatus(job.status); setSetup(undefined); router.refresh(); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Could not queue render"); } finally { setBusy(false); }
          }}>{busy ? "Queuing…" : "Create export"}</button>
          </>}
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
