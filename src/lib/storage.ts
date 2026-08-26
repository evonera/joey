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

export async function generateUploadUrl(filename: string, contentType: string, tenantId: string) {
  const ext = filename.split(".").pop() || "bin";
  const key = `${tenantId}/${crypto.randomUUID()}.${ext}`;

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

  return { uploadUrl, key, publicUrl: buildPublicUrl(key) };
}

/** Server-side direct upload (flow nodes, generated media). */
export async function uploadBufferToR2(
  body: Buffer | Uint8Array,
  contentType: string,
  tenantId: string,
  opts?: { customKey?: string; signal?: AbortSignal },
): Promise<{ key: string; publicUrl: string }> {
  const key = opts?.customKey ?? `${tenantId}/${crypto.randomUUID()}`;
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
    { abortSignal: opts?.signal },
  );
  return { key, publicUrl: buildPublicUrl(key) };
}

export function getBucket(): string {
  return getBucketName();
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

/** Robust compensating deletion for unreferenced uploads with backoff retries. */
export async function deleteObjectWithRetry(key: string, maxAttempts = 3): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await deleteObject(key);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, 200 * attempt));
      }
    }
  }
  throw new Error(
    `Compensating deletion failed: unable to delete orphaned R2 object (${key}) after ${maxAttempts} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}
