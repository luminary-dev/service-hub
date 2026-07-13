# Media & uploads


All image uploads (provider avatars, work photos, review photos, verification
documents) go through **media-service** (internal-only).

- **Limits.** Max **5 MB** per file; allowed types **JPEG, PNG, WebP** (a
  413/400 otherwise). The web upload UI pre-checks type and size.
- **Re-encoding.** Every image is decoded and re-encoded with `sharp`: EXIF
  orientation is baked in, then **all metadata is stripped** (removing EXIF GPS
  so home locations don't leak). JPEG is re-encoded at quality 85.
- **Resized variants (#382).** Alongside the sanitized original, each upload
  produces two downscaled derivatives with `sharp`: **`thumb` (400px wide)** and
  **`medium` (800px wide)**. They share the original's format, EXIF-strip and
  quality, and only ever downscale — a small original is re-encoded at its own
  size, never upscaled. Widths are sized to the display surfaces: the widest
  raster is the provider-card cover (`sizes` tops out at 384 CSS px → ~768px at
  2× DPR, covered by `medium`); `thumb` covers 1× cards, gallery thumbnails and
  avatars.
- **Storage.** Files are stored in **Cloudflare R2** under
  `{namespace}/{prefix}/{uuid}.{ext}` and served back through the app's
  `/api/files/...` route with a long immutable cache. Variants sit beside the
  original under a deterministic `{uuid}.{variant}.{ext}` key, so the serve path
  finds them by name and the sweep traces them back to the original. The bucket
  stays private — bytes are streamed through the service, never from a public
  bucket URL. A local-disk fallback mirrors the same URL shape when R2 is not
  configured.
- **Requesting a variant.** Add `?variant=thumb` (or `medium`) to the
  `/api/files/...` URL. If the variant is missing — pre-#382 uploads have only
  the original — the serve path **falls back to the original** (older files are
  not lazily regenerated). An unknown variant value is ignored and the original
  is served. Only the original's URL is persisted in the DB; variants are
  addressed off it.
- **Cleanup.** Orphaned files (no DB row references them) are removed by a sweep
  with a 24-hour grace period. Every namespace is covered (#555): the service
  owning the referencing rows exposes the sweep — provider-service for
  `provider` + `category`, review-service for `review`, identity-service for
  `user`. A variant is kept or removed **on the basis of
  its base original**: while the original is referenced its variants survive,
  and when the original is swept its variants go with it (and `delete` removes
  all of them together).

## next/image optimization for `/api/files/*` (verified #382)

The web app renders uploads through **Next's image optimizer** — `<Image>` is
used with `unoptimized` set **only for SVG** placeholders (`src/lib/image.ts`
`isSvg()`); real raster uploads (JPEG/PNG/WebP) are optimized normally. There is
no `images` block in `next.config.ts`, which is **correct**: `/api/files/*` is
same-origin (served via the request-time proxy in `src/proxy.ts`), so no
`remotePatterns` entry is needed and the default `deviceSizes`/`imageSizes`
apply. The optimizer needs `sharp`; it ships as a hoisted (optional) dependency
of `next` and is present in the standalone runtime, so optimization does **not**
no-op in production. Because `/api/files/*` is public at the gateway (no session
required), the optimizer's server-side fetch resolves without cookies.

The media-side `thumb`/`medium` variants are complementary, not redundant: they
cap the **bytes the optimizer ingests** (it would otherwise fetch the full
5 MB / 50 MP original just to downscale it) and give a correct image on any path
that bypasses the optimizer. A minimal, safe follow-up for list/grid thumbnails
would be to request `?variant=thumb` as the `<Image src>` for `ProviderCard`
covers and gallery thumbnails; this doc records the recommendation rather than
bundling a UI change here.
