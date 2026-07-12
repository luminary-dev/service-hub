# Admin operations guide

The admin panel is the operations console for Baas.lk — moderation, provider
and user management, categories, jobs, and analytics. It lives inside
the Next.js web app under `/admin` and talks to the backend services through
the same API gateway as the rest of the app (see
[ARCHITECTURE.md](ARCHITECTURE.md)).

This document is the canonical reference for what each admin capability does
and how to reach it. For the authorization model (roles, gating helpers), see
[AUTHZ.md](AUTHZ.md); the source of truth is `src/lib/roles.ts`.

It is split into focused pages:

- **[Accessing the panel & dashboard](admin/access-and-dashboard.md)** — how to
  reach `/admin`, the tier gate, and the analytics home.
- **[Moderation](admin/moderation.md)** — the verification queue, reports queue,
  content takedowns, restores and automated flagging.
- **[Providers](admin/providers.md)** — the providers list (search / filter /
  sort / paginate), quality score, bulk actions.
- **[Categories](admin/categories.md)** — the managed category list, cover
  images, activate/deactivate.
- **[Users](admin/users.md)** — account search, lock/unlock, role change,
  force-logout.
- **[Jobs](admin/jobs.md)** — the read-only jobs oversight (and the v0.2
  monetization deferral).
- **[Audit log](admin/audit-log.md)** — the merged moderation audit trail.
- **[Impersonation](admin/impersonation.md)** — the "view as" support tool.
- **[Notifications & bootstrapping the first admin](admin/notifications-and-bootstrap.md)**
  — the in-app admin badges and the `create-admin` bootstrap.
