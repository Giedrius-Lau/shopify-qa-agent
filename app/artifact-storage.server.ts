import { readFile } from "node:fs/promises";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export function artifactObjectKey(shopKey: string, scanId: string, filename: string): string {
  return `${shopKey}/${scanId}/${filename}`;
}

export async function persistArtifact(localPath: string, objectKey: string): Promise<void> {
  const config = r2Config();
  if (!config) return;
  await client(config).send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    Body: await readFile(localPath),
    ContentType: "image/png",
    CacheControl: "private, max-age=3600",
  }));
}

export async function readPersistedArtifact(objectKey: string): Promise<Uint8Array | null> {
  const config = r2Config();
  if (!config) return null;
  try {
    const response = await client(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    return response.Body ? await response.Body.transformToByteArray() : null;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

export async function deletePersistedArtifacts(prefix: string): Promise<void> {
  const config = r2Config();
  if (!config) return;
  const r2 = client(config);
  let continuationToken: string | undefined;
  do {
    const listed = await r2.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, ContinuationToken: continuationToken }));
    const objects = (listed.Contents ?? []).flatMap((item) => item.Key ? [{ Key: item.Key }] : []);
    if (objects.length) await r2.send(new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: objects, Quiet: true } }));
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}
