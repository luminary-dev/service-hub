# notification-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/notification-service`](https://github.com/luminary-dev/service-hub/tree/main/services/notification-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Stateless email service for Service Hub (Baas.lk), listening on `:4005`. It
owns the transactional email templates (English and Sinhala) ported from the
monolith and sends them via [Resend](https://resend.com) when `RESEND_API_KEY`
is set — otherwise it logs the email to the console and reports
`delivered: false`, so the whole flow works locally without any account.

It has no database. It is internal-only: every request (except `/healthz`)
must carry `x-internal-secret: $INTERNAL_API_SECRET`, or it is rejected with
`403 { "error": "Forbidden" }`.

## Endpoints

| method | path | body | response |
|---|---|---|---|
| `GET` | `/healthz` | — | `200 { ok: true, service: "notification-service" }` |
| `POST` | `/internal/email/verify` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/password-reset` | `{ to, url, locale? }` | `200 { ok: true, delivered: boolean }` |
| `POST` | `/internal/email/job-response` | `{ to, url, providerName, jobTitle, locale? }` | `200 { ok: true, delivered: boolean }` |

- `locale` is `"en"` or `"si"`; it defaults to `"en"` and any other value is
  coerced to `"en"`.
- Invalid bodies return `400 { "error": "Invalid input" }`.

## Environment

See `.env.example`:

| var | default | purpose |
|---|---|---|
| `PORT` | `4005` | listen port |
| `INTERNAL_API_SECRET` | `dev-internal-secret` | shared secret for internal calls |
| `RESEND_API_KEY` | *(empty)* | Resend API key; when unset, emails are logged to the console |
| `EMAIL_FROM` | `Baas.lk <onboarding@resend.dev>` | From address for outgoing email |

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
