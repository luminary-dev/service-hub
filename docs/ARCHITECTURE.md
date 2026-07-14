# Service Hub — Microservice Architecture

Service Hub (Baas.lk) is split into **eight backend services** plus an API
gateway (nine Hono services in all), with the Next.js 16 app as a pure frontend. This repo is the
**canonical monorepo**; each service under `services/` is also mirrored to its
own repository in the `luminary-dev` org via `git subtree` (see
`scripts/sync-service-repos.sh`).

```
browser ── same-origin /api/* ──> Next.js web (:3000)
   │                               │  proxy.ts rewrites /api/* ──> api-gateway (:4000)
   │                               ^  server components fetch the gateway directly
   │  /agent/chat ──────────────────────────────> chat-service (:4007)  (direct, NOT via gateway)
   │
   gateway (only public entry) verifies sh_session JWT, forwards identity
   headers (x-user-id / x-user-role / x-user-name) + x-internal-secret and routes to:
     ├── identity-service     (:4001)  identity_db   User/auth/favorites/saved-searches/admin-users/impersonation
     ├── provider-service     (:4002)  provider_db   providers/categories/inquiries/reports/admin
     ├── review-service       (:4003)  review_db     reviews/review-reports/admin
     ├── job-service          (:4004)  job_db        jobs/responses/job-reports/admin
     ├── notification-service (:4005)  (no db)        email templates (internal-only)
     ├── media-service        (:4006)  (no db)        upload bytes + sharp; serves /files/*
     ├── chat-service         (:4007)  (no db)        streaming Claude assistant
     └── search-service       (:4008)  search_db     provider search + geo discovery (derived index)
```

Infra: one **Postgres 16** cluster with **PostGIS** (image
`postgis/postgis:16-3.5-alpine`; host port 5433 → container 5432) holding five
databases (`identity_db`, `provider_db`, `review_db`, `job_db`, `search_db`),
and **Redis 7** (gateway rate-limit window). Each service owns its database —
no service touches another's tables; cross-service data access goes through
internal HTTP endpoints. notification/media/chat are stateless (no DB).
`search_db` is special: a **derived, rebuildable index** over provider data
(the [search & discovery RFC](rfcs/search-discovery-service.md)) — provider-
and review-service push documents/ratings into it S2S, a daily reindex sweep
self-heals drift, and it is deliberately excluded from backups.

The gateway never routes to notification-service (internal-only) or
chat-service (the web app proxies `/agent/chat` straight to it — the gateway
buffers, and a direct stream does not). Its `ServiceName` union is
`identity | provider | review | job | media | search`.

## In detail

The rest of the architecture reference is split into focused pages:

- **[Shared conventions](architecture/conventions.md)** — stack, logging, error
  shape, health probes, internal-secret auth, user identity, context headers,
  S2S calls, the JWT session, and session revocation.
- **[Environment variables](architecture/environment.md)** — the full var table
  (who reads what).
- **[Data ownership](architecture/data-model.md)** — which service owns which
  models; the no-shared-tables / no-cross-service-FK rules.
- **[Uploads](architecture/uploads.md)** — the media-service pipeline, R2 vs
  local disk, namespaces, and the `/files` serving path.
- **[API gateway & endpoint routing](architecture/gateway.md)** — the gateway
  request pipeline (CSRF, rate limits, session verify, routing) and the
  endpoint-reference pointer.
- **[Admin surface](architecture/admin-surface.md)** — the ADMIN/SUPPORT tiers
  and the audit-trail model.
- **[Web app & local development](architecture/web-and-dev.md)** — the web
  app's request-time proxy and the local dev workflow.

The endpoint-by-endpoint reference lives in **[API.md](API.md)**.
