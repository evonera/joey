'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getChatVideoCapability, startChatVideoRender } from '@/app/actions/chat-video';
import { getAssetForCreation, listAssets, registerAsset, requestUploadUrl } from '@/app/actions/assets';
import { getMediaRender, retryMediaRender } from '@/app/actions/media';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type VideoAsset = Awaited<ReturnType<typeof listAssets>>['assets'][number];
type Render = Awaited<ReturnType<typeof getMediaRender>>;

export function VideoCreator({ onSaved, resume, initialAssetId, onStartNew }: { onSaved: () => void; resume: { jobId: string; draftId: string } | null; initialAssetId: string | null; onStartNew: () => void }) {
  const [capability, setCapability] = React.useState<Awaited<ReturnType<typeof getChatVideoCapability>> | null>(null);
  const [assets, setAssets] = React.useState<VideoAsset[]>([]);
  const [selected, setSelected] = React.useState<VideoAsset | null>(null);
  const [title, setTitle] = React.useState('');
  const [start, setStart] = React.useState(0);
  const [duration, setDuration] = React.useState(15);
  const [captions, setCaptions] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [jobId, setJobId] = React.useState<string | null>(resume?.jobId || null);
  const [draftId, setDraftId] = React.useState<string | null>(resume?.draftId || null);
  const [render, setRender] = React.useState<Render | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void getChatVideoCapability().then(setCapability).catch((err) => setError(err instanceof Error ? err.message : 'Could not check video setup.'));
    void listAssets({ mimeType: 'video/mp4', limit: 20 }).then(async (result) => {
      const chosen = initialAssetId ? result.assets.find((asset) => asset.id === initialAssetId) || await getAssetForCreation(initialAssetId) : null;
      setAssets(chosen && !result.assets.some((asset) => asset.id === chosen.id) ? [chosen, ...result.assets] : result.assets);
      if (chosen?.mimeType === 'video/mp4') setSelected(chosen);
    }).catch(() => {});
  }, [initialAssetId]);

  React.useEffect(() => {
    if (!resume?.jobId) return;
    void getMediaRender(resume.jobId).then(setRender).catch((err) => setError(err instanceof Error ? err.message : 'Could not load video render.'));
  }, [resume?.jobId]);

  React.useEffect(() => {
    if (!jobId || render?.status === 'succeeded' || render?.status === 'failed' || render?.status === 'cancelled') return;
    const timer = window.setInterval(() => {
      void getMediaRender(jobId).then((result) => {
        setRender(result);
        if (result.status === 'succeeded') onSaved();
      }).catch((err) => setError(err instanceof Error ? err.message : 'Could not check render status.'));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [jobId, render?.status, onSaved]);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.type !== 'video/mp4' || !file.name.toLowerCase().endsWith('.mp4')) { toast.error('Choose an MP4 video.'); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error('Choose an MP4 under 50 MB.'); return; }
    setUploading(true);
    try {
      const { uploadUrl, key } = await requestUploadUrl(file.name, file.type);
      const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'Content-Disposition': 'attachment' }, body: file });
      if (!response.ok) throw new Error('Video upload failed.');
      const { asset } = await registerAsset({ filename: file.name, key, mimeType: file.type, size: file.size });
      setAssets((items) => [asset, ...items]);
      setSelected(asset);
      toast.success('Video uploaded');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Video upload failed.'); }
    finally { setUploading(false); }
  }

  async function startRender() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await startChatVideoRender({ assetId: selected.id, title, start, duration, captions });
      if (result.error) throw new Error(result.error);
      if (!result.jobId || !result.draftId) throw new Error('Render did not start.');
      setJobId(result.jobId);
      setDraftId(result.draftId);
      setRender(await getMediaRender(result.jobId));
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start video render.'); }
    finally { setSubmitting(false); }
  }

  async function retry() {
    if (!jobId) return;
    try { setRender(await retryMediaRender(jobId)); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not retry render.'); }
  }

  return <section aria-label="Video creator" className="space-y-3 rounded-xl border border-border/60 bg-card p-3 text-sm">
    <div><h2 className="font-semibold">Create a video</h2><p className="text-xs text-muted-foreground">Choose an MP4, add a headline, and render a short vertical clip. Review the finished file before publishing.</p></div>
    {!capability && !error && <p role="status" className="text-xs text-muted-foreground">Checking video setup…</p>}
    {capability?.issue && <p role="status" className="rounded-lg border border-amber-500/30 p-2 text-xs">{capability.issue}</p>}
    {capability?.available && <>
      <label className="block text-xs font-medium">Source MP4 (50 MB maximum)
        <Input type="file" accept="video/mp4,.mp4" disabled={uploading || Boolean(jobId)} onChange={(event) => void upload(event.target.files?.[0])} className="mt-1" />
      </label>
      {assets.length > 0 && <label className="block text-xs font-medium">Or choose an uploaded video
        <select value={selected?.id || ''} onChange={(event) => setSelected(assets.find((asset) => asset.id === event.target.value) || null)} disabled={Boolean(jobId)} className="mt-1 w-full rounded-md border border-input bg-background p-2"><option value="">Choose a video</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select>
      </label>}
      {selected && <video src={selected.publicUrl} controls preload="metadata" onLoadedMetadata={(event) => { const length = event.currentTarget.duration; if (Number.isFinite(length)) setDuration(Math.max(1, Math.min(15, Math.floor(length)))); }} className="max-h-56 w-full rounded-lg bg-black" />}
      <label className="block text-xs font-medium">Headline<Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} placeholder="What should viewers notice?" className="mt-1" disabled={Boolean(jobId)} /></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-xs font-medium">Start (seconds)<Input type="number" min={0} max={86400} value={start} onChange={(event) => setStart(Number(event.target.value))} className="mt-1" disabled={Boolean(jobId)} /></label><label className="text-xs font-medium">Length (1–60 seconds)<Input type="number" min={1} max={60} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1" disabled={Boolean(jobId)} /></label></div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={captions} onChange={(event) => setCaptions(event.target.checked)} disabled={Boolean(jobId) || !capability.captionsAvailable} /> Automatic captions</label>
      {capability.captionIssue && <p className="text-xs text-muted-foreground">{capability.captionIssue}</p>}
      {!jobId && <Button size="sm" onClick={() => void startRender()} disabled={!selected || !title.trim() || submitting || uploading}>{submitting ? 'Starting…' : 'Render video'}</Button>}
    </>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {render && <div role="status" className="space-y-2 rounded-lg border border-border/60 p-3"><p className="text-xs font-medium capitalize">Render {render.status}</p>{render.error && <p className="text-xs text-destructive">{render.error}</p>}{render.status === 'succeeded' && render.output?.publicUrl && <video src={render.output.publicUrl} controls className="max-h-72 w-full rounded-lg bg-black" />}{render.status === 'failed' && render.canRetry && <Button size="sm" variant="outline" onClick={() => void retry()}>Retry render</Button>}{draftId && <Button asChild size="sm" variant="outline"><Link href={`/compose?draftId=${draftId}`}>{render.status === 'succeeded' ? 'Review draft and publish' : 'Open saved draft'}</Link></Button>}<Button size="sm" variant="ghost" onClick={() => { setJobId(null); setDraftId(null); setRender(null); setSelected(null); setTitle(''); onStartNew(); }}>Start another video</Button></div>}
    {capability?.available && <p className="text-xs text-muted-foreground">Worker availability is confirmed by the render result. A queued job may take a few minutes.</p>}
  </section>;
}
