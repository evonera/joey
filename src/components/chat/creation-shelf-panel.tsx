'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createManualPost } from '@/app/actions/compose';
import { getCreationShelf } from '@/app/actions/creation-shelf';
import { Button } from '@/components/ui/button';
import { VideoCreator } from './video-creator';

type Shelf = Awaited<ReturnType<typeof getCreationShelf>>;
type ShelfDraft = Shelf['drafts'][number];

export function CreationShelfPanel({ onUsePrompt, mode, videoAssetId, onModeChange }: { onUsePrompt: (prompt: string) => void; mode: 'post' | 'video'; videoAssetId: string | null; onModeChange: (mode: 'post' | 'video') => void }) {
  const [shelf, setShelf] = React.useState<Shelf | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [selectedDraft, setSelectedDraft] = React.useState<ShelfDraft | null>(null);
  const [resumableVideo, setResumableVideo] = React.useState<{ jobId: string; draftId: string } | null>(null);
  const [content, setContent] = React.useState('');

  const reload = React.useCallback(async () => {
    try {
      setShelf(await getCreationShelf());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your work.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void reload(); }, [reload]);

  function openDraft(draft: ShelfDraft) {
    if (draft.source === 'chat_video' && draft.renderJobId) {
      setResumableVideo({ jobId: draft.renderJobId, draftId: draft.id });
      onModeChange('video');
      return;
    }
    onModeChange('post');
    setSelectedDraft(draft);
    setContent(draft.content);
  }

  async function saveDraft() {
    if (!content.trim() && !selectedDraft?.mediaUrls.length) return;
    setSaving(true);
    try {
      const result = await createManualPost({
        draftId: selectedDraft?.id,
        content,
        mediaUrls: selectedDraft?.mediaUrls || [],
        accountIds: selectedDraft?.accountId ? [selectedDraft.accountId] : [],
        scheduleType: 'draft',
      });
      if (result.error) throw new Error(result.error);
      toast.success('Draft saved');
      const savedId = result.draftIds?.[0];
      await reload();
      if (!selectedDraft && savedId) setSelectedDraft({ id: savedId, content, status: 'draft', accountId: null, source: 'compose', renderJobId: null, renderStatus: null, mediaUrls: [], createdAt: new Date().toISOString() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save draft.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-4 text-sm">
      <div className="flex gap-2" role="group" aria-label="Creation type"><Button size="sm" variant={mode === 'post' ? 'default' : 'outline'} onClick={() => onModeChange('post')}>Post</Button><Button size="sm" variant={mode === 'video' ? 'default' : 'outline'} onClick={() => onModeChange('video')}>Video</Button></div>
      {mode === 'video' ? <VideoCreator key={resumableVideo?.jobId || 'new'} resume={resumableVideo} initialAssetId={videoAssetId} onSaved={() => void reload()} onStartNew={() => setResumableVideo(null)} /> : <>
      <section aria-label="Post editor" className="space-y-3 rounded-xl border border-border/60 bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">{selectedDraft ? 'Edit draft' : 'Create a post'}</h2>
            <p className="text-xs text-muted-foreground">Save an idea here before connecting an account.</p>
          </div>
          {selectedDraft && <Button size="sm" variant="ghost" onClick={() => { setSelectedDraft(null); setContent(''); }}>New</Button>}
        </div>
        <textarea
          aria-label="Post content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write a post, or ask Joey for a first draft in Chat…"
          className="min-h-32 w-full resize-y rounded-lg border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {selectedDraft?.mediaUrls.length ? <p className="text-xs text-muted-foreground">{selectedDraft.mediaUrls.length} attached media item(s) kept with this draft.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void saveDraft()} disabled={saving || (!content.trim() && !selectedDraft?.mediaUrls.length)}>{saving ? 'Saving…' : 'Save draft'}</Button>
          <Button size="sm" variant="outline" onClick={() => onUsePrompt(content.trim() ? `Help me improve this social post, then save the result as a draft: ${content}` : 'Help me write a social post. Ask me for the topic and audience, then save a draft.')}>Improve with Joey</Button>
          {selectedDraft && <Button asChild size="sm" variant="ghost"><Link href={`/compose?draftId=${selectedDraft.id}`}>Media and publishing</Link></Button>}
        </div>
      </section>
      </>}

      {error && <p role="alert" className="text-destructive">{error} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p>}
      {loading && <p role="status" className="text-muted-foreground">Loading your work…</p>}

      <section className="space-y-2" aria-label="Saved drafts">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Saved drafts</h2><Link href="/drafts?tab=draft" className="text-xs underline">View all</Link></div>
        {!loading && !shelf?.drafts.length && <p className="text-xs text-muted-foreground">Your saved posts will appear here.</p>}
        {shelf?.drafts.map((draft) => <button key={draft.id} type="button" onClick={() => openDraft(draft)} className="block w-full rounded-lg border border-border/50 p-3 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span className="line-clamp-2">{draft.content || 'Media draft'}</span><span className="mt-1 block text-xs capitalize text-muted-foreground">{draft.source === 'chat_video' ? `Video · ${draft.renderStatus || 'render status available'}` : draft.status.replace('_', ' ')}</span></button>)}
      </section>

      <section className="space-y-2" aria-label="Theme Studio posts">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Theme Studio posts</h2><Link href="/drafts?source=theme_studio" className="text-xs underline">View all</Link></div>
        {!loading && !shelf?.posts.length && <p className="text-xs text-muted-foreground">Generated posts will appear here.</p>}
        {shelf?.posts.map((post) => <article key={post.id} className="space-y-2 rounded-lg border border-border/50 p-3">
          <div className="flex items-start justify-between gap-2"><h3 className="font-medium">{post.title}</h3><span className="text-xs capitalize text-muted-foreground">{post.status.replace('_', ' ')}</span></div>
          <p className="text-xs text-muted-foreground">{post.themePageName}</p>
          {post.mediaUrls[0] && <div className="overflow-hidden rounded-md bg-muted"><img src={post.mediaUrls[0]} alt={`Preview of ${post.title}`} className="max-h-48 w-full object-contain" /></div>}
          {post.caption && <p className="line-clamp-3 whitespace-pre-wrap text-xs">{post.caption}</p>}
          <div className="flex gap-3 text-xs"><Link href={`/drafts?tab=all&source=theme_studio&search=${encodeURIComponent(post.title)}`} className="underline">Open post</Link><button type="button" className="underline" onClick={() => onUsePrompt(`Use this Theme Studio post as a reference for an original new post. Theme page: ${post.themePageName}. Post: ${post.title}. Caption: ${post.caption}`)}>Use in Chat</button></div>
        </article>)}
      </section>

      <section className="space-y-2" aria-label="Theme Studio templates">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Templates</h2><Link href="/theme-studio/templates" className="text-xs underline">View all</Link></div>
        {!loading && !shelf?.templates.length && <p className="text-xs text-muted-foreground">Your Theme Studio templates will appear here.</p>}
        {shelf?.templates.map((template) => <article key={template.id} className="rounded-lg border border-border/50 p-3">
          {template.previewUrl && <img src={template.previewUrl} alt={`Preview of ${template.name}`} className="mb-2 max-h-40 w-full rounded-md object-contain" />}
          <h3 className="font-medium" title={template.name}>{template.name.replace(/\s*\([0-9a-f-]{36}\)$/, '')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{template.themePageName} · {template.formatName}</p>
          <p className="mt-1 text-xs text-muted-foreground">Apply visual styles in Theme Studio; Chat drafts text copy.</p>
          <div className="mt-2 flex gap-3 text-xs"><Link href={template.themePageId ? `/theme-studio/${template.themePageId}/templates/${template.id}` : `/theme-studio/templates/${template.id}`} className="underline">Edit style</Link><button type="button" className="underline" onClick={() => onUsePrompt(`Draft original copy for ${template.themePageName} to accompany the ${template.formatName} template ${template.name}. Ask for the topic and audience. Save a text draft only; visual rendering remains in Theme Studio.`)}>Draft copy in Chat</button></div>
        </article>)}
      </section>
    </div>
  );
}
