# API — request lifecycle & conventions

## How requests reach a service

- **The api-gateway (:4000) is the only public entry.** Browsers and the web
  app's server components hit same-origin `/api/*`; Next's `src/proxy.ts`
  rewrites that to the gateway at request time.
- At the edge the gateway applies, in order: **CSRF** check (non-GET/HEAD/OPTIONS),
  **rate limiting** (per-route, keyed by client IP — see
  [RATE_LIMITING.md](../RATE_LIMITING.md)), a **6 MB body limit** (413 above it),
  then it verifies the `sh_session` JWT (or an `impersonation_session` cookie),
  forwards `x-user-id` / `x-user-role` / `x-user-name` plus the shared
  `x-internal-secret`, and proxies to the owning service.
- **Auth is a httpOnly cookie** (`sh_session`, HS256), minted only by
  identity-service. Endpoints marked *authenticated* require it; *public*
  endpoints work without it; *optional session* endpoints behave differently
  when it is present (e.g. de-duplicated reports, attributed inquiries).
- **Roles** are `CUSTOMER`, `PROVIDER`, `ADMIN`, `SUPPORT`. Admin routes gate on
  `isSupportOrAdmin` (reads + report resolve/dismiss — ADMIN **or** SUPPORT) or
  `isFullAdmin` (destructive writes — ADMIN only). See [AUTHZ.md](../AUTHZ.md).
- **Anything containing `/internal`** (raw or percent-encoded) is never routed
  publicly — the gateway returns 404. `/internal/*` routes are S2S-only,
  guarded by a constant-time internal-secret check.
- **No pricing, payments, transactions, commission or billing endpoints exist.**
  Monetization is deferred to v0.2; the platform is free to use in v0.1. (Job
  requests carry an optional customer-stated `budget`, but there is no
  transaction ledger, price agreement, or commission anywhere.)

Every service also exposes `GET /healthz` (unauthenticated). The four DB
services (identity, provider, review, job) run it as a readiness probe
(`200 {ok:true,service}` / `503 {ok:false,service,db:"down"}`); gateway, media,
notification and chat return the static `200 {ok:true,service}`.

---


## Conventions

- **Error shape:** every error is `{ "error": string }`. Success shapes are
  per-endpoint (documented above).
- **Status codes:** `400` invalid input, `401` unauthenticated, `403` forbidden
  (wrong role, failed CSRF, or missing internal secret), `404` not found
  (also used to hide existence — suspended providers, non-party inquiry threads),
  `409` conflict (duplicate email / category slug), `413` payload too large
  (> 6 MB at the gateway, > 5 MB at media), `429` rate limited (with
  `Retry-After`), `500` unhandled, `502` an upstream/S2S dependency was
  unavailable on a write path, `503` DB-service readiness failure / assistant
  disabled.
- **Locale:** the gateway sets `x-locale` (`en`|`si`) from the `lang` cookie;
  services localize emails and assistant replies from it. The web proxy is the
  trust boundary — a client-sent locale header can't reach the app.
- **Uploads** are multipart to the owning service (provider/review), which
  streams bytes to media-service over S2S; images are re-encoded with sharp,
  EXIF-stripped, limited to 5 MB and jpeg/png/webp. Stored URLs resolve back
  through `GET /api/files/<namespace>/*`.
- **Pagination:** list endpoints that page return `{ <items>, total, page,
  pageSize }`. Caps: public provider directory `pageSize` ≤ 24 (default 12);
  admin lists ≤ 100 (default 20); job board/mine ≤ 50 (default 20). Public
  reviews use cursor pagination (`take` ≤ 100, `cursor`/`nextCursor`).
