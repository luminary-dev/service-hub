# Features guide

Baas.lk is a Sri Lankan services marketplace connecting customers with local
professionals (mechanics, electricians, plumbers, and more). This document
describes the core user-facing flows and how they map onto the code.

Architecture context: the Next.js app is a pure frontend. Client components
call same-origin `/api/*`, which `src/proxy.ts` rewrites to the API gateway;
server components call the gateway directly. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the service map and
[RATE_LIMITING.md](RATE_LIMITING.md) for the per-endpoint limits referenced
throughout. For admin/moderation flows see [ADMIN.md](ADMIN.md).

The user-facing flows are split into focused pages:

- **[Provider registration, profile & verification](features/registration.md)**
  — the register/login surface (incl. Google social login), the account
  self-service portal (profile, email, avatar), role switching, the provider
  dashboard (profile / services / photos / cover), and verification.
- **[Discovery](features/discovery.md)** — the providers listing, search,
  filters and the provider cards/profiles.
- **[Inquiries & messaging](features/inquiries.md)** — the inquiry form and the
  customer ⇄ provider threads.
- **[Jobs (reverse-marketplace)](features/jobs.md)** — posting jobs, provider
  responses, and the (informational-only) budget.
- **[Reviews](features/reviews.md)** — ratings, photos, and the verified-
  interaction badge.
- **[Favorites](features/favorites.md)** — saving providers.
- **[Saved searches & alerts](features/saved-searches.md)** — saving a
  providers search and getting emailed when a new professional matches.
- **[In-app notifications](features/notifications.md)** — the navbar bell,
  the `/account/notifications` feed, and per-type delivery preferences.
- **[AI chat assistant](features/chat.md)** — the marketplace concierge.
- **[Bilingual EN/SI & theme](features/i18n-and-theme.md)** — the localization
  and light/dark theming.
- **[Media & uploads](features/media.md)** — the image pipeline as it surfaces
  to users.
