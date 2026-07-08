# media-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/media-service`](https://github.com/luminary-dev/service-hub/tree/main/services/media-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Media / image-processing service for Service Hub (Baas.lk), listening on `:4006`.
It owns the upload **bytes** and the `sharp` pipeline; the database rows that
reference the stored URLs stay with their owning service (provider-service,
review-service). No database. Internal-only: every request except `/healthz`
(including `/files/*`, for which the gateway supplies the secret on behalf of
browsers) must carry `x-internal-secret`, else `403 { "error": "Forbidden" }`.

## Endpoints

| method | path | description |
|---|---|---|
| `GET` | `/healthz` | `200 { ok: true, service: "media-service" }` (no secret). |
| `GET` | `/files/:namespace/*` | Serve a stored file (public through the gateway as `/api/files/<namespace>/*`); only `jpg`/`jpeg`/`png`/`webp` served, `cache-control: public, max-age=31536000, immutable`. |
| `POST` | `/internal/media/store` | Multipart `namespace` / `prefix` / `file` → `{ url }`. Runs the sharp pipeline; `413` over 5 MB, `400` for non-images / bad namespace. |
| `POST` | `/internal/media/delete` | `{ url }` → best-effort removal, always `{ ok: true }`. |
| `POST` | `/internal/media/sweep` | `{ namespace, referenced[], graceMs? }` → `{ scanned, removed }` orphan sweep. |

## Sharp pipeline (`lib/media.ts` → `processImage`)

Decodes and re-encodes every upload, proving it is a real JPEG/PNG/WebP
(polyglots / mislabeled files fail to decode → 400). It applies EXIF orientation
via `.rotate()` and then strips **all** metadata (EXIF GPS in phone photos would
otherwise leak home locations), re-encoding to the same family (JPEG `q=85`, PNG,
WebP). One processed output per upload (`<uuid>.<ext>`) — no thumbnails / extra
sizes. Max upload 5 MB.

## Storage backends

Precedence: **Cloudflare R2** (S3-compatible, private bucket) when all four
`R2_*` vars are set, else local disk under `$MEDIA_DIR/<namespace>/`. In R2 mode
bytes are streamed back from the private bucket through `/files`; on local disk
they are read via a traversal-guarded resolver. Either way the persisted URL
stays same-origin `/api/files/<namespace>/...`, so there is no public bucket or
public base-URL env var. Namespaces are allow-listed (`provider`, `review`);
prefixes must match `^[a-zA-Z0-9_-]+$`. The orphan sweep lists the store and
removes files older than the grace window (default 24h) that are absent from the
caller-supplied `referenced` set — the grace window protects in-flight uploads
racing their DB write.

## Environment

| var | default | purpose |
|---|---|---|
| `PORT` | `4006` | listen port |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (required in production) | S2S auth |
| `MEDIA_DIR` | `./data` | local storage root (local-disk mode) |
| `R2_ENDPOINT` | *(unset)* | R2 S3 endpoint (`https://<account>.r2.cloudflarestorage.com`) |
| `R2_BUCKET` | *(unset)* | R2 bucket name |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | *(unset)* | R2 credentials |

All four `R2_*` vars must be set together to enable R2; otherwise it falls back
to local disk.

## Run

```sh
npm install
npm run dev        # tsx watch on :4006
npm run typecheck / npm test / npm run build / npm start
```

## Docker build (sharp native binary)

`sharp` needs a platform-specific prebuilt binary (its native `.node` plus the
bundled `libvips-cpp.so`), shipped as *optional* npm dependencies. npm can
silently drop an optional dep on a transient fetch error (npm/cli#4828), which
used to intermittently ship an image whose sharp crashed at boot with
`ERR_DLOPEN_FAILED` (#351). The `runtime` stage of the `Dockerfile` therefore
runs `scripts/install-sharp-binary.cjs` to reinstall that binary as a
**required** package (build fails loudly instead of producing a broken image),
then smoke-tests `require('sharp')`. libc + CPU are detected at build time, so
the same Dockerfile works for both `linuxmusl-x64` (CI) and `linuxmusl-arm64`
(Apple-Silicon dev). No change is needed here when Dependabot bumps `sharp` —
the binary's version is read from sharp's own `optionalDependencies`.
