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

