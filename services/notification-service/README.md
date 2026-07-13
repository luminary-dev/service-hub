# notification-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/notification-service`](https://github.com/luminary-dev/service-hub/tree/main/services/notification-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Stateless email service for Service Hub (Baas.lk), listening on `:4005`. It owns
the transactional email templates (English and Sinhala) and sends them via
[Resend](https://resend.com) when `RESEND_API_KEY` is set — otherwise it logs the
email to the console and reports `delivered: false`, so the whole flow works
locally without any account. User-controlled values are HTML-escaped and links
are scheme-validated before rendering.

No database. Internal-only: every request except `/healthz` must carry
`x-internal-secret: $INTERNAL_API_SECRET` (constant-time checked), or it is
rejected with `403 { "error": "Forbidden" }`. See
[EMAIL_SETUP.md](../../docs/EMAIL_SETUP.md) for enabling real delivery.

## Endpoints

| method | path | body | response |
|---|---|---|---|
| `GET` | `/healthz` | — | `200 { ok: true, service: "notification-service" }` |
| `POST` | `/internal/email/verify` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/password-reset` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/change-email` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/account-exists` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/inquiry` | `{ to, url, customerName, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/job-response` | `{ to, url, providerName, jobTitle, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/new-job` | `{ recipients: string[], url, jobTitle, district, locale? }` | `202 { ok: true, accepted }` (sends in the background, #557) |
| `POST` | `/internal/email/new-provider-match` | `{ recipients: string[], url, providerName, district, locale? }` | `202 { ok: true, accepted }` (sends in the background) |

- Each endpoint maps to a template in `src/lib/email.ts`: verify-email
  (24h link), password-reset (1h link), change-email (1h link, #396),
  account-exists (registration anti-enumeration, #373 — links to sign-in),
  new-inquiry, job-response, new-job (matching-provider lead-gen alert on a
  new job post, #501 — a fan-out that emails every matching provider one copy)
  and new-provider-match (saved-search alert on a new provider publish, #516 —
  the reverse-direction fan-out) — all rendered EN + SI through a shared
  branded `layout()`.
- `locale` is `"en"` or `"si"`; it defaults to `"en"` and any other value is
  coerced to `"en"`.
- Invalid bodies return `400 { "error": "Invalid input" }`.

## Environment

| var | default | purpose |
|---|---|---|
| `PORT` | `4005` | listen port |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (required in production) | shared secret for internal calls |
| `RESEND_API_KEY` | *(empty)* | Resend API key; when unset, emails are logged to the console (`delivered: false`) |
| `EMAIL_FROM` | `Baas.lk <onboarding@resend.dev>` | From address (must be on a verified domain for real delivery) |

## Run

```sh
npm install
npm run dev        # tsx watch, http://localhost:4005

npm run typecheck
npm test
npm run build      # emits dist/
npm start          # node dist/index.js
```

Or with Docker:

```sh
docker build -t notification-service .
docker run --rm -p 4005:4005 --env-file .env notification-service
```
