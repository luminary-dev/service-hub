# Uploads (media-service :4006)


Image processing and storage are owned by **media-service**:
`POST /internal/media/store` (multipart — decodes/re-encodes with sharp, strips
EXIF, returns the URL to persist), `POST /internal/media/delete`,
`POST /internal/media/sweep`. provider- and review-service call it over S2S via
a thin identical `lib/storage.ts` client (`storeImage(namespace, file,
prefix)`); the photo **rows** stay with them. Namespaces (`provider`, `review`,
`category` — admin trade cover images #436, `user` — per-user avatars #434)
preserve the `/api/files/<namespace>/...` URL shape.

**Backend precedence: Cloudflare R2 > local disk.** R2 (S3-compatible,
**private** bucket) is used when all four `R2_*` vars are set — the S3 client
talks to R2, no AWS involved — else local disk under `$MEDIA_DIR/<namespace>/`.
media serves `GET /files/<namespace>/*` (public through the gateway, which
routes `/api/files/{provider,review,category,user}/*` → media `/files/*` and
supplies the internal secret). R2 objects are **streamed from the private
bucket** through the `/files` route, so stored URLs stay same-origin and match
the local-disk shape (no public bucket/domain needed). **No Vercel Blob.**
Limits: 5MB, jpeg/png/webp.

## Verification documents are PII — admin-gated, never public (#500)

Provider verification uploads (NIC / business-registration scans) are stored
under the media **`verification`** prefix (`provider/verification/...`) and must
never be served on the public `/files` path. Two layers enforce this:

- **Gateway:** `/api/files/provider/verification/*` is carved out **ahead** of
  the public media forward and routed to **provider-service** instead of media
  (see `services/api-gateway/src/lib/routes.ts`). Every other
  `/api/files/provider/*` upload (work photos, avatars, covers) still forwards
  to media unchanged.
- **provider-service** answers that path with an **ADMIN/SUPPORT-gated** route
  (`isSupportOrAdmin`; a non-admin gets `403`). It fetches the bytes from media
  over S2S via `GET /internal/media/raw?url=<stored /api/files url>` and streams
  them back with `Cache-Control: private, no-store` (PII is never shared-cached).
- **media** refuses the `verification` prefix on its public `/files` route as
  defence-in-depth (`isVerificationSubpath`), and only hands the bytes out
  through the internal-secret-gated `/internal/media/raw` endpoint.

The document's stored URL is unchanged (`/api/files/provider/verification/...`),
so the orphan sweep, account-erasure delete, and any pre-existing documents keep
working and are served through the gated route with no data migration.

**Resized variants (#382).** `storeFile` writes two downscaled derivatives next
to each original — `thumb` (400px) and `medium` (800px) — under a deterministic
`<uuid>.<variant>.<ext>` name in the same backend/namespace, re-encoded through
the same sharp pipeline (EXIF-stripped, same format/quality, downscale-only).
Request one with `?variant=thumb|medium` on the `/api/files/...` URL; the serve
path tries the variant object/file and **falls back to the original** when it's
absent (pre-#382 uploads; older files are not lazily regenerated) or when the
value is unknown. Only the **original's** URL is persisted by callers — variants
are addressed off it, so `deleteFile` removes the original and every variant
together, and the orphan sweep keeps/removes a variant on the basis of whether
its base original is referenced (`findOrphans` maps `<uuid>.thumb.jpg` back to
`<uuid>.jpg` before the membership check).

