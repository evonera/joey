'use server';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getActiveTenantId, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiKeys, assets, drafts, tenants } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { isR2Configured } from '@/lib/storage';
import { cancelRender, submitRender } from '@/lib/media-engine/engine';
import { dispatchQueuedRender } from '@/lib/media-engine/dispatch';
import { WHISPER_USD_PER_MINUTE } from '@/lib/ai-pricing';

const inputSchema = z.object({
  assetId: z.uuid(),
  title: z.string().trim().min(1).max(140),
  start: z.number().finite().min(0).max(86400),
  duration: z.number().finite().min(1).max(60),
  captions: z.boolean(),
}).strict();

function capabilityIssue(): string | null {
  if (process.env.MEDIA_ENGINE_ENABLED !== 'true') return 'Video rendering is not enabled for this workspace deployment.';
  if (!isR2Configured()) return 'Video rendering needs object storage to be configured.';
  if (!process.env.MEDIA_WORKER_SECRET || process.env.MEDIA_WORKER_SECRET.length < 32) return 'Video rendering needs the media worker secret to be configured.';
  return null;
}

async function captionIssue(tenantId: string): Promise<string | null> {
  const key = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, 'openai'), eq(apiKeys.status, 'active')), columns: { id: true } });
  if (!key) return 'Add an active OpenAI key in Settings to generate automatic captions.';
  const rate = process.env.MEDIA_TRANSCRIPTION_USD_PER_MINUTE === undefined ? WHISPER_USD_PER_MINUTE : Number(process.env.MEDIA_TRANSCRIPTION_USD_PER_MINUTE);
  if (!Number.isFinite(rate) || rate <= 0) return 'Configure the transcription price before using automatic captions.';
  return null;
}

export async function getChatVideoCapability() {
  const tenantId = await getActiveTenantId();
  const issue = capabilityIssue();
  const captionBlocker = issue ? null : await captionIssue(tenantId);
  return { available: !issue, issue, workerVerified: false, captionsAvailable: !captionBlocker && !issue, captionIssue: captionBlocker };
}

export async function startChatVideoRender(raw: unknown) {
  const tenantId = await requireRole(["owner", "admin", "editor", "member"]);
  const issue = capabilityIssue();
  if (issue) return { error: issue };
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  if (input.captions) {
    const captionBlocker = await captionIssue(tenantId);
    if (captionBlocker) return { error: captionBlocker };
  }
  const sourceAsset = await db.query.assets.findFirst({ where: and(eq(assets.id, input.assetId), eq(assets.tenantId, tenantId)) });
  if (!sourceAsset || sourceAsset.mimeType !== 'video/mp4') return { error: 'Choose an uploaded MP4 from this workspace.' };
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId), columns: { name: true, slug: true } });
  const revision = createHash('sha256').update(JSON.stringify({ title: input.title, assetKey: sourceAsset.key, start: input.start, duration: input.duration, captions: input.captions })).digest('hex');
  const [draft] = await db.insert(drafts).values({
    tenantId,
    content: input.title,
    status: 'draft',
    platformOptions: { source: 'chat_video', mediaUrls: [], sourceAssetId: sourceAsset.id, renderRevision: revision, renderStatus: 'preparing' },
  }).returning({ id: drafts.id });
  let jobId: string | undefined;
  try {
    const render = await submitRender(tenantId, {
      version: 1,
      source: { kind: 'draft', id: draft.id, revision },
      template: 'branded_clip',
      templateVersion: 1,
      format: 'mp4',
      media: { id: sourceAsset.id, version: sourceAsset.key },
      title: input.title,
      brand: { name: (tenant?.name || 'Your brand').slice(0, 100), handle: tenant?.slug ? `@${tenant.slug}`.slice(0, 100) : '', accent: '#ffe633' },
      crop: { mode: 'cover', x: 0.5, y: 0.5 },
      video: { start: input.start, duration: input.duration, captions: input.captions, zoom: 1, sourceAudio: true, words: [] },
    }, { dispatch: false });
    jobId = render.jobId;
    if (render.status === 'queued') await dispatchQueuedRender(render.jobId);
    return { draftId: draft.id, jobId: render.jobId, status: render.status };
  } catch (error) {
    if (jobId) await cancelRender(tenantId, jobId).catch(() => {});
    await db.delete(drafts).where(and(eq(drafts.id, draft.id), eq(drafts.tenantId, tenantId)));
    return { error: error instanceof Error ? error.message : 'Could not start video render.' };
  }
}
