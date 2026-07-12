// Media / image processing (extracted from provider- and review-service, #36
// et al.). This service owns the BYTES and the sharp pipeline; the DB rows
// that reference the URLs stay with their owning service. Namespaces map to
// the callers so their existing /api/files/<namespace>/... URLs keep working
// unchanged (the volumes are simply remounted here).
import { mkdir, writeFile, unlink, readdir, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { r2Enabled, r2Put, r2Delete, r2List } from "./r2";

// Processed uploads are always one of these three formats (see processImage).
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const DEFAULT_GRACE_MS = 24 * 60 * 60_000;

// Resized derivative widths generated alongside every upload (#382). Originals
// are full-resolution (up to 5 MB / 50 MP); provider cards and gallery
// thumbnails only need a fraction of that on a mobile-first connection. Widths
// are picked from how images are displayed: the widest raster surface is the
// provider-card cover (its `sizes` tops out at 384 CSS px → ~768px at 2× DPR, so
// `medium` 800 covers it crisply), while `thumb` 400 covers 1× cards, gallery
// thumbnails and avatars. Variants only ever downscale (see `withoutEnlargement`
// in processImage) — a small original is re-encoded at its own size, never
// upscaled. Keep this ordered smallest-first.
export const IMAGE_VARIANTS = { thumb: 400, medium: 800 } as const;
export type VariantName = keyof typeof IMAGE_VARIANTS;
export const VARIANT_NAMES = Object.keys(IMAGE_VARIANTS) as VariantName[];

export function isVariantName(value: string): value is VariantName {
  return Object.prototype.hasOwnProperty.call(IMAGE_VARIANTS, value);
}

// Derives a variant's filename/subpath/key from the original's by inserting a
// `.<variant>` token before the extension: `<uuid>.jpg` → `<uuid>.thumb.jpg`.
// Works uniformly on a bare filename, a `<prefix>/<uuid>.<ext>` subpath, or a
// full `<namespace>/<prefix>/<uuid>.<ext>` key — it only touches the extension,
// so it never introduces a path separator or `..`. Originals carry a UUID stem
// (no interior dots), so the token can be recovered unambiguously by baseUrl().
export function variantName(name: string, variant: VariantName): string {
  const ext = path.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  return `${stem}.${variant}${ext}`;
}

// Inverse of variantName at the URL level: maps a stored file's /api/files URL
// back to the original it derives from, so the orphan sweep can keep-or-remove a
// variant on the basis of what the DB references (only originals are persisted).
// `<uuid>.thumb.jpg` → `<uuid>.jpg`; originals (UUID stem, no interior dot) map
// to themselves.
export function baseUrl(url: string): string {
  const ext = path.extname(url);
  const stem = ext ? url.slice(0, -ext.length) : url;
  const dot = stem.lastIndexOf(".");
  if (dot === -1) return url;
  const token = stem.slice(dot + 1);
  return isVariantName(token) ? stem.slice(0, dot) + ext : url;
}

// Root under which each namespace's files live. In compose the callers'
// original upload volumes are mounted at $MEDIA_DIR/<namespace>, so existing
// files resolve with no migration.
const MEDIA_DIR = process.env.MEDIA_DIR ?? "./data";
// "category" holds admin-uploaded trade cover images (#436); "user" holds
// per-user avatars (#434). Prod stores both in R2 (no volume needed); local dev
// writes under $MEDIA_DIR/<namespace>.
const NAMESPACES = new Set(["provider", "review", "category", "user"]);

// A prefix is a single path segment chosen by the calling service ("uploads",
// "reviews"). It is joined into the on-disk path and the R2 object key, so it
// must not be able to contain path separators or `..` — otherwise a caller that
// derives the prefix from user input could write outside the namespace root
// (local) or escape the per-namespace key scoping the sweep relies on (R2).
const PREFIX_RE = /^[a-zA-Z0-9_-]+$/;

export function isKnownNamespace(namespace: string): boolean {
  return NAMESPACES.has(namespace);
}

export class InvalidNamespaceError extends Error {}

// Thrown when the prefix isn't a plain single-segment slug — mapped to 400.
export class InvalidPrefixError extends Error {}

// Thrown when a payload does not decode as a real JPEG/PNG/WebP — callers
// translate it into a 400.
export class InvalidImageError extends Error {}

// Decode-and-re-encode with sharp (#19/#132/#140): proves the payload really
// is an image in the claimed family (a polyglot or mislabeled file fails to
// decode), applies the EXIF orientation, and drops ALL metadata — EXIF GPS
// coordinates in tradespeople's phone photos would otherwise leak home
// locations.
// A `width` (#382) resizes the output to that width, only ever downscaling
// (`withoutEnlargement`) so a small original is re-encoded at its own size
// rather than blown up. Omitted for the sanitized original, set for each
// derivative variant. Format, EXIF-strip and quality are identical either way.
export async function processImage(
  input: Buffer,
  width?: number
): Promise<{ data: Buffer; ext: string }> {
  try {
    const img = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    // rotate() bakes in the EXIF orientation BEFORE metadata is stripped, so
    // phone photos don't come out sideways; resize() then applies to the
    // upright image.
    img.rotate();
    if (width) img.resize({ width, withoutEnlargement: true });
    if (meta.format === "jpeg") {
      return { data: await img.jpeg({ quality: 85 }).toBuffer(), ext: "jpg" };
    }
    if (meta.format === "png") {
      return { data: await img.png().toBuffer(), ext: "png" };
    }
    if (meta.format === "webp") {
      return { data: await img.webp().toBuffer(), ext: "webp" };
    }
  } catch {
    // fall through
  }
  throw new InvalidImageError("Only JPEG, PNG or WebP images are allowed");
}

function nsDir(namespace: string): string {
  return path.join(MEDIA_DIR, namespace);
}

// Processes and stores an upload, returning the gateway-served /api/files/...
// path to persist (backed by R2 or local disk).
export async function storeFile(
  namespace: string,
  prefix: string,
  buffer: Buffer
): Promise<string> {
  if (!NAMESPACES.has(namespace)) {
    throw new InvalidNamespaceError(`unknown namespace: ${namespace}`);
  }
  if (!PREFIX_RE.test(prefix)) {
    throw new InvalidPrefixError(`invalid prefix: ${prefix}`);
  }
  const { data, ext } = await processImage(buffer);
  const filename = `${crypto.randomUUID()}.${ext}`;
  const contentType = MIME[ext] ?? "application/octet-stream";
  // Resized derivatives (#382), stored alongside the original under a
  // deterministic `<uuid>.<variant>.<ext>` name so the serve path can find them
  // without a lookup table and the sweep can trace them back to the original.
  const variants = await Promise.all(
    VARIANT_NAMES.map(async (v) => ({
      name: variantName(filename, v),
      data: (await processImage(buffer, IMAGE_VARIANTS[v])).data,
    }))
  );
  // R2 (private bucket): store under the namespaced key and return the internal
  // /api/files URL — objects are streamed back through the /files route, so the
  // stored URL shape matches local disk (no public bucket / domain needed). Only
  // the original's URL is returned/persisted; variants are addressed off it.
  if (r2Enabled()) {
    const key = `${namespace}/${prefix}/${filename}`;
    await r2Put(key, data, contentType);
    for (const v of variants) {
      await r2Put(`${namespace}/${prefix}/${v.name}`, v.data, contentType);
    }
    return `/api/files/${key}`;
  }
  const dir = path.join(nsDir(namespace), prefix);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), data);
  for (const v of variants) {
    await writeFile(path.join(dir, v.name), v.data);
  }
  return `/api/files/${namespace}/${prefix}/${filename}`;
}

// Best-effort deletion (errors swallowed) — deletes the object from R2 or the
// file from local disk, resolved from the stored /api/files/... URL.
export async function deleteFile(url: string): Promise<void> {
  try {
    const m = /^\/api\/files\/([a-z]+)\/(.+)$/.exec(url);
    if (m && NAMESPACES.has(m[1])) {
      // Delete the original and each resized variant (#382). Callers only track
      // the original's URL, so the variants must be swept up here.
      const subpaths = [m[2], ...VARIANT_NAMES.map((v) => variantName(m[2], v))];
      for (const sub of subpaths) {
        try {
          if (r2Enabled()) {
            await r2Delete(`${m[1]}/${sub}`);
          } else {
            const target = resolveFilePath(m[1], sub);
            if (target) await unlink(target);
          }
        } catch {
          // best-effort per file
        }
      }
    }
  } catch {
    // best-effort
  }
}

// GET /files/<namespace>/<sub> handler support: resolve against the
// namespace root, refuse path traversal and unknown namespaces.
export function resolveFilePath(
  namespace: string,
  subpath: string
): string | null {
  if (!NAMESPACES.has(namespace)) return null;
  const root = path.resolve(nsDir(namespace));
  const resolved = path.resolve(
    root,
    path.normalize(subpath).replace(/^([/\\])+/, "")
  );
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export type StoredFile = { key: string; url: string; modifiedAt: Date };

// Pure so the policy is unit-testable: an orphan is old enough to be outside
// the grace window (protects in-flight uploads racing their DB write) AND
// unreferenced by any database row. A resized variant (#382) is referenced on
// the basis of its base original — the DB only tracks originals — so baseUrl()
// maps `<uuid>.thumb.jpg` to `<uuid>.jpg` before the membership check. This
// keeps a live image's variants and, conversely, sweeps an orphaned original's
// variants along with it.
export function findOrphans(
  files: StoredFile[],
  referenced: Set<string>,
  graceMs = DEFAULT_GRACE_MS,
  now = Date.now()
): StoredFile[] {
  return files.filter(
    (f) => now - f.modifiedAt.getTime() > graceMs && !referenced.has(baseUrl(f.url))
  );
}

async function listLocal(namespace: string): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  const root = nsDir(namespace);
  let prefixes: string[];
  try {
    prefixes = await readdir(root);
  } catch {
    return files; // nothing stored yet
  }
  for (const prefix of prefixes) {
    const dir = path.join(root, prefix);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue; // not a directory
    }
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        const s = await stat(full);
        if (!s.isFile()) continue;
        files.push({
          key: full,
          url: `/api/files/${namespace}/${prefix}/${name}`,
          modifiedAt: s.mtime,
        });
      } catch {
        // raced a delete — skip
      }
    }
  }
  return files;
}

// Removes stored files in a namespace that no DB row references. The caller
// (which owns the rows) supplies the referenced URL set; this service owns
// the store, so it lists and deletes. Removal is best-effort per file.
export async function sweep(
  namespace: string,
  referenced: Set<string>,
  graceMs = DEFAULT_GRACE_MS
): Promise<{ scanned: number; removed: number }> {
  if (!NAMESPACES.has(namespace)) {
    throw new InvalidNamespaceError(`unknown namespace: ${namespace}`);
  }
  const useR2 = r2Enabled();
  let files: StoredFile[];
  if (useR2) {
    // key IS the storage key; url mirrors the stored /api/files/... form so it
    // matches the caller's referenced set.
    files = (await r2List(`${namespace}/`)).map((o) => ({
      key: o.key,
      url: `/api/files/${o.key}`,
      modifiedAt: o.modifiedAt,
    }));
  } else {
    files = await listLocal(namespace);
  }
  const orphans = findOrphans(files, referenced, graceMs);
  let removed = 0;
  for (const f of orphans) {
    try {
      if (useR2) {
        await r2Delete(f.key);
      } else {
        await unlink(f.key);
      }
      removed++;
    } catch {
      // best-effort — a failed delete just isn't counted
    }
  }
  return { scanned: files.length, removed };
}
