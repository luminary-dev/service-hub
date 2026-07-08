# api-gateway (:4000)

> [!WARNING]
> This repository is a **read-only mirror** of [`services/api-gateway`](https://github.com/luminary-dev/service-hub/tree/main/services/api-gateway) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

The single publicly exposed entry point for Service Hub. No database. It
terminates the cross-cutting edge concerns — structured request logging, CSRF,
per-route rate limiting, a request-body cap and session (JWT) verification —
then reverse-proxies every `/api/*` request to the right backend service
(identity, provider, review, job, media). It strips any client-supplied trusted
headers and stamps its own identity headers plus `x-internal-secret` on each
upstream request. The gateway **adds** the internal secret; it does not require
one itself.

## Routing table (`src/lib/routes.ts`, longest / most-specific match first)

| Public path | Upstream | Upstream path |
|---|---|---|
| `/api/files/provider/*`, `/api/files/review/*` | media | rewritten to `/files/*` |
| `/api/account/inquiries` | provider | unchanged |
| `/api/account/reviews` | review | unchanged |
| `/api/providers/:id/reviews` | review | unchanged |
| `/api/admin/reviews/*`, `/api/admin/review-reports*`, `/api/admin/review-audit-log`, `/api/admin/review-stats` | review | unchanged |
| `/api/reviews/*` | review | unchanged |
| `/api/admin/users*`, `/api/admin/impersonate/*`, `/api/admin/signups` | identity | unchanged |
| `/api/admin/jobs*` | job | unchanged |
| `/api/admin/*` (everything else, incl. `/api/admin/reports`, `/api/admin/audit-log`, `/api/admin/notifications/counts`) | provider | unchanged |
| `/api/photos/:id/report` | provider | unchanged |
| `/api/auth/*` | identity | unchanged |
| `/api/favorites`, `/api/favorites/*` | identity | unchanged |
| `/api/providers`, `/api/providers/*`, `/api/provider/*`, `/api/inquiries/*`, `/api/categories`, `/api/stats` | provider | unchanged |
| `/api/jobs`, `/api/jobs/*` | job | unchanged |
| anything else | — | `404 { "error": "Not found" }` |

The `/api/admin/*` namespace fans out across services: review, identity and job
each carve out their own admin sub-paths ahead of the generic provider
fallback. Any path containing `/internal` (literal or percent-encoded) is
**never** forwarded — it 404s. The gateway does **not** enforce auth on any
route; it forwards identity when present and each upstream decides its own 401s.

`GET /healthz` → `200 { ok: true, service: "api-gateway" }` (not proxied, not
logged, no CSRF / rate-limit / body cap).

## Behaviors

- **CSRF** (`src/lib/csrf.ts`): `GET`/`HEAD`/`OPTIONS` always pass. Other methods
  pass when `sec-fetch-site` is `same-origin` or `none`; if that header is
  absent, the `origin` host is compared against `x-forwarded-host` ?? `host`.
  Rejected → `403 { "error": "Cross-site request blocked." }`. Header-based
  defence-in-depth on top of `SameSite=Lax` cookies (no CSRF token).
- **Rate limiting** (`src/lib/rate-limit.ts`): applies to **`POST`** only, keyed
  on client IP (first `x-forwarded-for`, else `x-real-ip`, else `unknown`).
  **Redis-backed sliding window when `REDIS_URL` is set** (shared across gateway
  instances, survives restarts); otherwise a per-instance in-memory window. A
  Redis error falls back to the in-memory check rather than failing the request.
  Over the limit → `429 { "error": "Too many requests. Please slow down and try
  again shortly." }` with `Retry-After`. See [RATE_LIMITING.md](../../docs/RATE_LIMITING.md)
  for the full per-route budget table and the XFF caveat (#201).
- **Identity** (`src/lib/session.ts` + `src/lib/proxy.ts`): client-sent
  `x-user-id`, `x-user-role`, `x-user-name`, `x-impersonated-by`,
  `x-internal-secret`, `x-locale`, `x-origin` and `x-request-id` are always
  stripped. The `sh_session` cookie is verified (jose, HS256, `AUTH_SECRET`;
  production refuses to start without it). A valid session sets `x-user-id`,
  `x-user-role`, `x-user-name` (URI-encoded) upstream; absent/invalid just omits
  them. A valid `impersonation_session` cookie (admin "view as", #234) takes
  priority and additionally sets `x-impersonated-by`. Every upstream request
  also gets `x-internal-secret`, `x-locale` (`si` if the `lang` cookie is `si`,
  else `en`), `x-origin` and a generated `x-request-id`.
- **Session-version revocation** (`src/lib/session-version.ts`): the JWT carries
  an `sv` claim; before forwarding identity, the gateway checks it against
  identity-service `GET /internal/users/:id/session-version` (cached 60s). A
  stale token drops its identity headers; a deleted user is rejected; an
  identity-service outage **fails open** so a blip doesn't sign everyone out.
- **Proxy** (`src/lib/proxy.ts`): streaming pass-through of method, path, query,
  headers and body (multipart included). Hop-by-hop headers are dropped; `host`
  is set to the upstream. Upstream responses (status + `Set-Cookie`) pass back
  verbatim. Unreachable upstream → `502 { "error": "Upstream service
  unavailable" }`; timeout (30s) → `504`.
- **Body limit**: `/api/*` bodies are capped at **6 MB** (covers the 5 MB image
  cap + multipart overhead); over → `413 { "error": "Payload too large" }`.

## Environment variables

| var | default | purpose |
|---|---|---|
| `PORT` | `4000` | listen port |
| `AUTH_SECRET` | `dev-only-secret` (required in production) | verify `sh_session` / impersonation JWTs |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (required in production) | stamped on every upstream request; session-version lookups |
| `REDIS_URL` | *(unset → in-memory fallback)* | enables Redis-backed distributed rate limiting |
| `IDENTITY_SERVICE_URL` | `http://localhost:4001` | upstream (+ session-version) |
| `PROVIDER_SERVICE_URL` | `http://localhost:4002` | upstream |
| `REVIEW_SERVICE_URL` | `http://localhost:4003` | upstream |
| `JOB_SERVICE_URL` | `http://localhost:4004` | upstream |
| `MEDIA_SERVICE_URL` | `http://localhost:4006` | upstream (file serving) |
| `WEB_ORIGIN` | `http://localhost:3000` | authoritative public origin for `x-origin` |

`NOTIFICATION_SERVICE_URL` is not routed publicly (notification is internal-only).

## Scripts

- `npm run dev` — tsx watch
- `npm run typecheck` / `npm test` / `npm run build` / `npm start`
