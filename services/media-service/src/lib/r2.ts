// Cloudflare R2 backend (S3-compatible). We talk to R2 with the S3 client — no
// AWS account or infrastructure is involved; R2 just speaks the S3 protocol.
// Enabled only when all four R2_* vars are set; otherwise media falls back to
// local disk. The bucket stays PRIVATE: objects are streamed
// back through media-service's /files route, so URLs keep the /api/files/...
// shape (no public bucket, no domain required).
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { log } from "./log";

// A GET failed because the object genuinely does not exist — the only case
// r2Get maps to null. Everything else (endpoint unreachable, expired/rotated
// keys, bucket misconfig, throttling) is a real fault we must NOT swallow.
function isMissingObject(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}

// Read env at call time (not module load) so config is never stale.
function cfg() {
  return {
    endpoint: process.env.R2_ENDPOINT,
    bucket: process.env.R2_BUCKET,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  };
}

export function r2Enabled(): boolean {
  const c = cfg();
  return Boolean(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    const c = cfg();
    client = new S3Client({
      region: "auto", // R2 ignores region but the SDK requires one
      endpoint: c.endpoint,
      credentials: {
        accessKeyId: c.accessKeyId as string,
        secretAccessKey: c.secretAccessKey as string,
      },
    });
  }
  return client;
}

export async function r2Put(key: string, body: Buffer, contentType: string) {
  await s3().send(
    new PutObjectCommand({
      Bucket: cfg().bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

// Returns the object bytes + stored content-type, or null if the key is absent.
export async function r2Get(
  key: string
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: cfg().bucket, Key: key })
    );
    const body = await res.Body!.transformToByteArray();
    return { body, contentType: res.ContentType };
  } catch (err) {
    // Only a genuinely absent object is a null (→ 404). Any other S3 error is
    // an R2 fault: swallowing it as null would mask an outage as a 404 for
    // every image and hide the incident from monitoring (#765). Log and
    // rethrow so the caller can surface a 5xx.
    if (isMissingObject(err)) return null;
    log.error("r2 GetObject failed", { key, err });
    throw err;
  }
}

export async function r2Delete(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: cfg().bucket, Key: key }));
}

// Lists every object under a namespace prefix (paginated), for the orphan sweep.
export async function r2List(
  prefix: string
): Promise<{ key: string; modifiedAt: Date }[]> {
  const out: { key: string; modifiedAt: Date }[] = [];
  let token: string | undefined;
  do {
    const res = await s3().send(
      new ListObjectsV2Command({
        Bucket: cfg().bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, modifiedAt: o.LastModified ?? new Date(0) });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}
