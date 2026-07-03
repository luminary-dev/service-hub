import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { put } from "@vercel/blob";

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Stores an uploaded image: Vercel Blob in production, local /public/uploads in
// dev. `prefix` groups files (e.g. "uploads", "verification").
export async function storeImage(file: File, prefix = "uploads"): Promise<string> {
  const filename = `${crypto.randomUUID()}.${EXT[file.type]}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`${prefix}/${filename}`, file, { access: "public" });
    return blob.url;
  }
  const dir = path.join(process.cwd(), "public", prefix);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `/${prefix}/${filename}`;
}

export function validateImage(file: unknown):
  | { ok: true; file: File }
  | { ok: false; error: string } {
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: "Only JPEG, PNG and WebP images are allowed" };
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { ok: false, error: "Image must be under 5MB" };
  }
  return { ok: true, file };
}
