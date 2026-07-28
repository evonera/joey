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
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID");

  const ext = filename.split(".").pop() || "bin";
  const key = `${tenantId}/${crypto.randomUUID()}.${ext}`;

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

  const publicUrl = `https://${getBucketName()}.${accountId}.r2.cloudflarestorage.com/${key}`;

  return { uploadUrl, key, publicUrl };
}

export async function headObject(key: string) {
  const client = getS3Client();
  const command = new HeadObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  return client.send(command);
}

export async function deleteObject(key: string) {
  const client = getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  return client.send(command);
}
