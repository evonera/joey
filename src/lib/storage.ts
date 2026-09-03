import { S3Client, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2 credentials: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function getBucketName() {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("Missing R2_BUCKET_NAME");
  return bucket;
}

/**
 * Upload allowlist (R2-only store). Extension and MIME must agree, otherwise
 * a caller can declare `image/png` while uploading `text/html`/SVG-JS that
 * is later served from the public URL (stored XSS).
 */
const ALLOWED_UPLOADS: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  mp4: ["video/mp4"],
  pdf: ["application/pdf"],
};

export const R2_UPLOAD_URL_EXPIRY_SECONDS = 300;
export const R2_MAX_ASSET_BYTES = 50 * 1024 * 1024;

export function sanitizeUploadExtension(filename: string): string {
  const raw = filename.split(".").pop() ?? "";
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
}

export function assertAllowedUpload(filename: string, contentType: string): string {
  const ext = sanitizeUploadExtension(filename);
  const allowed = ALLOWED_UPLOADS[ext];
  if (!ext || !allowed || !allowed.includes(contentType)) {
    throw new Error(`Upload type not allowed: .${ext || "bin"} (${contentType})`);
  }
  return ext;
}

export async function generateUploadUrl(filename: string, contentType: string, tenantId: string) {
  if (!tenantId || tenantId.includes("/") || tenantId.includes("..")) {
    throw new Error("Invalid tenant namespace for upload.");
  }
  const ext = assertAllowedUpload(filename, contentType);
  const key = `${tenantId}/${crypto.randomUUID()}.${ext}`;

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
    ContentDisposition: "attachment",
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: R2_UPLOAD_URL_EXPIRY_SECONDS });

  return { uploadUrl, key, publicUrl: buildPublicUrl(key) };
}

export async function uploadBufferToR2(
  body: Buffer | Uint8Array,
  contentType: string,
  tenantId: string,
  opts?: { customKey?: string; signal?: AbortSignal },
): Promise<{ key: string; publicUrl: string }> {
  if (opts?.customKey && !opts.customKey.startsWith(`${tenantId}/`)) {
    throw new Error("Invalid asset key: namespace mismatch");
  }
  const key = opts?.customKey ?? `${tenantId}/${crypto.randomUUID()}`;
  if (key.includes("..")) throw new Error("Invalid asset key.");
  await getS3Client().send(new PutObjectCommand({ Bucket: getBucketName(), Key: key, Body: body, ContentType: contentType, ContentDisposition: "attachment" }), { abortSignal: opts?.signal });
  return { key, publicUrl: buildPublicUrl(key) };
}

export async function headObject(key: string) {
  const client = getS3Client();
  const command = new HeadObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  return client.send(command);
}

function getAccountId() {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID");
  return id;
}

export function buildPublicUrl(key: string) {
  return `https://${getBucketName()}.${getAccountId()}.r2.cloudflarestorage.com/${key}`;
}

export async function deleteObject(key: string) {
  const client = getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  return client.send(command);
}

export async function deleteObjectWithRetry(key: string, maxAttempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { await deleteObject(key); return; }
    catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
  throw new Error(`Unable to delete orphaned R2 object ${key}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
