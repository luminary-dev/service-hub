# Service Hub — API reference

The consolidated endpoint reference for Service Hub (Baas.lk): every public
`/api/*` route the web app can call, and every internal `/internal/*` route
services call each other with. It is derived from the code — the gateway routing
table (`services/api-gateway/src/lib/routes.ts`) and each service's route
handlers — not from memory. [ARCHITECTURE.md](ARCHITECTURE.md) stays the
authority on *how* the system is wired; this file is the authority on *what the
endpoints are*.

This reference is split into focused parts:

- **[Request lifecycle & conventions](api/request-lifecycle.md)** — how a request
  reaches a service (proxy → gateway → owning service), and the shared response /
  error / auth conventions every endpoint follows.
- **[Public / client API](api/public.md)** (`/api/*`) — auth & session,
  favorites, providers & search, the provider dashboard, inquiries, reviews,
  jobs, media/files, and the chat assistant.
- **[Admin API](api/admin.md)** (`/api/admin/*`) — the SUPPORT/ADMIN-gated
  moderation, verification, user-management, category and jobs surfaces.
- **[Internal S2S API](api/internal.md)** (`/internal/*`) — the never-public
  service-to-service endpoints, grouped by owning service.
