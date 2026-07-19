# Mobile app (Flutter)

The customer mobile app lives at **`mobile/`** in the monorepo (package name
`baas_mobile`) and is mirrored read-only to
[`luminary-dev/service-hub-mobile-app`](https://github.com/luminary-dev/service-hub-mobile-app)
via `npm run sync:repos` — the same contract as the service mirrors: **all
changes land here via monorepo PRs**, never on the mirror.

## What it is

A bilingual (English/Sinhala) customer app covering the v1 surface: browse &
geo search, provider profiles, inquiries + message threads, favorites, job
posts, review submission, the AI assistant, and notifications (in-app +
optional FCM push). Provider-side management and admin stay on the web.

## How it talks to the backend

- **Everything goes through the api-gateway** (`API_BASE_URL`, default
  `http://localhost:4000`) — same rule as every other client. The one
  exception is the AI assistant: `POST /agent/chat` on the **web app**
  (`WEB_BASE_URL`), because the gateway buffers responses and the assistant
  streams SSE.
- **Auth is Bearer, not cookies** (#797): `POST /api/auth/token` returns a
  15-minute access JWT + a rotating 60-day refresh token, stored in the
  platform keychain. The Dio interceptor attaches `Authorization: Bearer`,
  refreshes proactively and retries once on 401. Revocation is the same
  `sessionVersion` scheme as the web (`docs/AUTHZ.md`).
- **Social login (#398):** the Google/Facebook buttons open the gateway's
  `/api/auth/oauth/:provider/start?client=mobile&redirect=baaslk://auth` in a
  system web-auth session (`flutter_web_auth_2`). When the callback sees the
  `client=mobile` flow it mints the same Bearer token pair and redirects to the
  app's `baaslk://` deep link with the tokens, instead of setting a web cookie —
  so social sign-in lands the app in the same authenticated state as password
  login. Requires the `GOOGLE_CLIENT_ID`/`FACEBOOK_CLIENT_ID` OAuth creds the
  web already uses; without them the buttons surface "unavailable". The
  `baaslk` URL scheme is registered on iOS/macOS/Android.
- **Locale**: the app sends `Cookie: lang=si` under the Sinhala locale so the
  gateway's existing locale detection localizes emails and assistant replies.
- **Verified-email gates (#115) apply unchanged**: unverified users can browse
  and inquire but the app surfaces the resend-verification banner for reviews
  and job posts.
- **Push (#798)**: the app registers its FCM token via
  `POST /api/notifications/devices` after sign-in and unregisters on
  sign-out. Without Firebase config the app runs fine — push init is
  fail-soft, in-app notifications still poll.

## Working on it

```bash
cd mobile
flutter pub get
flutter analyze && flutter test        # what CI runs
flutter run --dart-define=API_BASE_URL=http://localhost:4000 \
            --dart-define=WEB_BASE_URL=http://localhost:3000
# Android emulator: use 10.0.2.2 instead of localhost.
```

CI runs `mobile / analyze|test|build` (debug APK artifact) on the same
workflow as the Node packages.

Layout (`mobile/lib/`): `src/api/` (Dio client, token store, repositories),
`src/models/` (defensive DTOs mirroring `docs/api/public.md`), `src/state/`
(Riverpod controllers), `src/features/<feature>/` (screens),
`l10n/` (ARB files; `flutter gen-l10n` outputs to `l10n/gen/`).

## Enabling push (one-time, needs a Firebase project)

1. `flutterfire configure` in `mobile/` and pass the generated options to
   `PushService.init`.
2. Set `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT` for notification-service
   (see `docs/features/notifications.md`).

## Release builds

Debug APKs come from CI. Store signing/release automation is deliberately not
set up yet — track it as follow-up work on #799.
