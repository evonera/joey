import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  submitRender: vi.fn(),
  dispatchQueuedRender: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getActiveTenantId: vi.fn().mockResolvedValue('tenant-1') }));
vi.mock('@/lib/storage', () => ({ isR2Configured: () => true }));
vi.mock('@/lib/media-engine/engine', () => ({ submitRender: mocks.submitRender, cancelRender: vi.fn() }));
vi.mock('@/lib/media-engine/dispatch', () => ({ dispatchQueuedRender: mocks.dispatchQueuedRender }));
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      assets: { findFirst: vi.fn().mockResolvedValue({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId: 'tenant-1', key: 'tenant-1/video.mp4', mimeType: 'video/mp4' }) },
      tenants: { findFirst: vi.fn().mockResolvedValue({ name: 'Acme', slug: 'acme' }) },
      apiKeys: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    insert: () => ({ values: (value: unknown) => { mocks.insertValues(value); return { returning: async () => [{ id: 'draft-1' }] }; } }),
    update: () => ({ set: (value: unknown) => { mocks.updateSet(value); return { where: async () => undefined }; } }),
    delete: () => ({ where: async () => undefined }),
  },
}));

describe('Chat video render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MEDIA_ENGINE_ENABLED', 'true');
    vi.stubEnv('MEDIA_WORKER_SECRET', 'a'.repeat(32));
    mocks.submitRender.mockResolvedValue({ jobId: 'job-1', status: 'queued' });
  });

  it('saves a draft source before queueing an MP4 render', async () => {
    const { startChatVideoRender } = await import('../chat-video');
    const result = await startChatVideoRender({ assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'A new clip', start: 0, duration: 15, captions: false });
    expect(result).toEqual({ draftId: 'draft-1', jobId: 'job-1', status: 'queued' });
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', tenantId: 'tenant-1' }));
    expect(mocks.submitRender).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ source: expect.objectContaining({ kind: 'draft', id: 'draft-1' }), format: 'mp4' }), { dispatch: false });
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ platformOptions: expect.objectContaining({ renderJobId: 'job-1' }) }));
    expect(mocks.dispatchQueuedRender).toHaveBeenCalledWith('job-1');
  }, 60000);
});
