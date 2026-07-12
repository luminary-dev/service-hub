# Media & uploads


All image uploads (provider avatars, work photos, review photos, verification
documents) go through **media-service** (internal-only).

- **Limits.** Max **5 MB** per file; allowed types **JPEG, PNG, WebP** (a
  413/400 otherwise). The web upload UI pre-checks type and size.
- **Re-encoding.** Every image is decoded and re-encoded with `sharp`: EXIF
  orientation is baked in, then **all metadata is stripped** (removing EXIF GPS
  so home locations don't leak). JPEG is re-encoded at quality 85.
- **Storage.** Files are stored in **Cloudflare R2** under
  `{namespace}/{prefix}/{uuid}.{ext}` and served back through the app's
  `/api/files/...` route with a long immutable cache. The bucket stays private —
  bytes are streamed through the service, never from a public bucket URL. A
  local-disk fallback mirrors the same URL shape when R2 is not configured.
- **Cleanup.** Orphaned files (no DB row references them) are removed by a sweep
  with a 24-hour grace period.
