import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();
const mockGetSignedUrl = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockSend;
  },
  PutObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  process.env.R2_BUCKET_NAME = 'test-bucket';
});

const { generateUploadUrl, headObject, deleteObject, assertAllowedUpload, sanitizeUploadExtension } = await import('../storage');

describe('storage', () => {
  describe('generateUploadUrl', () => {
    it('returns uploadUrl, key, and publicUrl', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed.url/upload');

      const result = await generateUploadUrl('photo.png', 'image/png', 'tenant-123');

      expect(result.uploadUrl).toBe('https://signed.url/upload');
      expect(result.key).toMatch(/^tenant-123\/[a-f0-9-]+\.png$/);
      expect(result.publicUrl).toBe(
        'https://test-bucket.test-account.r2.cloudflarestorage.com/' + result.key
      );
    });

    it('rejects when credentials are missing', async () => {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;

      await expect(generateUploadUrl('f.png', 'image/png', 't-1')).rejects.toThrow(
        'Missing R2 credentials'
      );
    });

    it('rejects MIME/extension mismatches (stored-XSS spoof)', async () => {
      await expect(generateUploadUrl('evil.png', 'text/html', 't-1')).rejects.toThrow(
        'Upload type not allowed'
      );
      await expect(generateUploadUrl('evil.svg', 'image/svg+xml', 't-1')).rejects.toThrow(
        'Upload type not allowed'
      );
    });

    it('sanitizes traversal extensions', () => {
      expect(sanitizeUploadExtension('a/bar/baz')).toBe('abarbaz');
      expect(sanitizeUploadExtension('../x.png')).toBe('png');
      expect(assertAllowedUpload('photo.JPG', 'image/jpeg')).toBe('jpg');
    });
  });

  describe('headObject', () => {
    it('sends HeadObjectCommand', async () => {
      const meta = { ContentLength: 1024, ContentType: 'image/png' };
      mockSend.mockResolvedValue(meta);

      const result = await headObject('tenant-123/file.png');
      expect(result).toEqual(meta);
    });
  });

  describe('deleteObject', () => {
    it('sends DeleteObjectCommand', async () => {
      mockSend.mockResolvedValue({});

      const result = await deleteObject('tenant-123/file.png');
      expect(result).toEqual({});
    });
  });
});
