# Baas.lk mobile app (`baas_mobile`)

Bilingual (English/Sinhala) Flutter customer app for the Baas.lk services
marketplace: browse & geo search, provider profiles, inquiries + threads,
favorites, job posts, reviews, the AI assistant, and notifications with
optional FCM push.

> **Read-only mirror notice** — like every `service-hub-*` repo, this
> repository is a read-only mirror of the
> [`service-hub`](https://github.com/luminary-dev/service-hub) monorepo
> (`mobile/` directory), synced via `npm run sync:repos`. Do not push or open
> PRs here; all changes land through monorepo PRs.

## Quickstart

```bash
flutter pub get
flutter analyze && flutter test
flutter run --dart-define=API_BASE_URL=http://localhost:4000 \
            --dart-define=WEB_BASE_URL=http://localhost:3000
```

- `API_BASE_URL` — the api-gateway (the app's only backend entry).
- `WEB_BASE_URL` — the Next.js web app; used solely for the SSE assistant
  (`POST /agent/chat`), which cannot go through the buffering gateway.
- Android emulators reach the host machine at `10.0.2.2`.

Auth uses Bearer access tokens + rotating refresh tokens (`/api/auth/token`,
`/api/auth/refresh`) stored in the platform keychain. Push is fail-soft: with
no Firebase config the app runs with in-app notifications only.

Full docs: [`docs/MOBILE.md`](https://github.com/luminary-dev/service-hub/blob/dev/docs/MOBILE.md)
in the monorepo.
