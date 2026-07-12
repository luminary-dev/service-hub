// Canonical src/lib/storage.ts for services that accept uploads
// (identity-service, provider-service, review-service). Image processing and
// the upload bytes are owned by media-service; this is just the thin S2S
// client. Those services keep BYTE-IDENTICAL copies — the caller passes its own
// namespace ("provider" / "review" / "category" / "user"), which media maps to
// the gateway routes /api/files/<namespace>/*. Storage backend (Cloudflare R2
// vs local disk) is media-service's concern, not the caller's.
import { s2s } from "./http";

const MEDIA_SERVICE_URL =
  process.env.MEDIA_SERVICE_URL ?? "http://localhost:4006";

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// A payload media-service could not decode as a real image — routes translate
// it into a 400.
export class InvalidImageError extends Error {}

// Cheap client-side pre-check (media re-validates by actually decoding).
export function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Only JPEG, PNG or WebP images are allowed";
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return "Image must be under 5MB";
  }
  return null;
}

// Uploads a file to media-service under this service's namespace, returning
// the URL to persist. Throws InvalidImageError on a 400 (non-image); throws
// on transport/other failure so the write path fails loudly.
export async function storeImage(
  namespace: string,
  file: File,
  prefix = "uploads"
): Promise<string> {
  // Re-serialize into a fresh in-memory Blob: a File pulled from an inbound
  // request's formData() can't be re-streamed into an outbound multipart body
  // (undici raises "fetch failed").
  const bytes = new Uint8Array(await file.arrayBuffer());
  const form = new FormData();
  form.set("namespace", namespace);
  form.set("prefix", prefix);
  form.set(
    "file",
    new Blob([bytes], { type: file.type || "application/octet-stream" }),
    "upload"
  );
  const res = await s2s(MEDIA_SERVICE_URL, "/internal/media/store", {
    method: "POST",
    body: form,
  });
  if (res.status === 400) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new InvalidImageError(
      data.error ?? "Only JPEG, PNG or WebP images are allowed"
    );
  }
  if (!res.ok) {
    throw new Error(`media-service store responded ${res.status}`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

// Best-effort deletion via media-service (errors swallowed).
export async function removeStoredFile(url: string): Promise<void> {
  try {
    await s2s(MEDIA_SERVICE_URL, "/internal/media/delete", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  } catch {
    // best-effort
  }
}

// Orphan sweep (ops tooling): the caller passes the set of URLs its rows still
// reference for a namespace; media-service removes any stored file not in that
// set. Fails loudly (unlike delete) since it's an explicit maintenance action.
export async function sweepMedia(
  namespace: string,
  referenced: string[]
): Promise<{ scanned: number; removed: number }> {
  const res = await s2s(MEDIA_SERVICE_URL, "/internal/media/sweep", {
    method: "POST",
    body: JSON.stringify({ namespace, referenced }),
  });
  if (!res.ok) {
    throw new Error(`media-service sweep responded ${res.status}`);
  }
  return (await res.json()) as { scanned: number; removed: number };
}
