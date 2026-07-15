# Email setup (verification, password reset & notifications)

Email is owned by **notification-service** (`services/notification-service`,
`:4005`), which renders the templates (EN + SI) and sends them via
[Resend](https://resend.com). It arrives on two paths, both S2S — nothing else
touches email:

- **Auth/security messages** (verify, password reset, change-email,
  account-exists, email-change-attempt) keep dedicated
  `POST /internal/email/*` routes. They are not notifications and can never be
  muted by preferences.
- **Marketplace notifications** (inquiry, thread reply, new review, review
  response, verification decisions, job match/response, saved-search match)
  flow through the generic `POST /internal/notifications/events` ingestion
  endpoint, which writes the in-app feed inline and queues the email sends
  behind per-user notification preferences (Redis queue with retries; see
  `docs/api/internal.md`).

See the [service README](../services/notification-service/README.md) for the
endpoint and template list.

> **Status: not delivering to real users until a sending domain is verified.**
> The code is deployed and works end to end, but with no `RESEND_API_KEY` (and no
> verified domain) it only logs the message — see the fallback below.

## How it behaves

`sendMail` picks a transport in this order: **SMTP** (`SMTP_URL`) →
**Resend** (`RESEND_API_KEY`) → **console fallback**.

- **`SMTP_URL` set** — mail is sent over SMTP (via `nodemailer`), bypassing
  Resend entirely. This is the local-dev path: the `docker compose` stack points
  it at **Mailpit** by default so every email is captured in a local inbox —
  see [Previewing emails locally with Mailpit](#previewing-emails-locally-with-mailpit).
- **No `SMTP_URL`, no `RESEND_API_KEY`** — notification-service does **not**
  send. It logs the full message (recipient, subject, HTML) to its container
  console and returns `{ ok: true, delivered: false }`. The whole flow
  (register → verify link, forgot-password → reset link) works with no account
  or SMTP server; you read the link from the logs.
- **`RESEND_API_KEY` set, no verified domain** — Resend only lets you send from
  `onboarding@resend.dev`, and that sandbox sender **only delivers to your own
  Resend-account email address**. Fine for a smoke test, not for customers.
- **`RESEND_API_KEY` set + verified domain** — real delivery from your
  `EMAIL_FROM` address. This is the production configuration (prod leaves
  `SMTP_URL` unset).

## Previewing emails locally with Mailpit

The dev `docker-compose.yml` ships a **[Mailpit](https://mailpit.axllent.org/)**
container (`#673`) — a fake SMTP server plus a web inbox — so you can read the
real rendered EN/SI emails locally without a Resend account or delivery to a
real address. notification-service is wired to it out of the box:
`SMTP_URL` defaults to `smtp://mailpit:1025`.

```bash
docker compose up -d          # Mailpit starts with the stack (dev only)
# trigger any email: register, request a password reset, send an inquiry, …
open http://localhost:8025     # the Mailpit inbox (loopback-bound, #387)
```

Notes:

- **Dev only.** Mailpit is in `docker-compose.yml`, never
  `docker-compose.prod.yml`. Production keeps using Resend.
- **In-memory inbox.** No volume is mounted, so each `docker compose up` starts
  with an empty inbox — expected for disposable local data.
- **Nothing critical depends on it.** If Mailpit is down, sends just retry via
  the `notify:email` queue and the app still boots.
- **Opting out.** Set `SMTP_URL=` (empty) in your repo-root `.env` to fall back
  to the Resend/console behavior above (e.g. to smoke-test a real Resend key).
- **Host path (`dev-all.sh`).** Run Mailpit alone with
  `docker compose up -d mailpit` and export `SMTP_URL=smtp://localhost:1025`
  for notification-service.

## Enabling production email

1. Register / confirm the sending domain (e.g. `baas.lk`).
2. Create a Resend account (free tier: 3,000 emails/mo, 100/day).
3. In Resend: **add the domain and verify it** — add the DNS records Resend
   provides (SPF/DKIM; DMARC recommended).
4. In Resend: create an **API key** (`re_...`).
5. Set the notification-service environment (in `docker-compose.prod.yml` /
   the deploy host's secrets — see [DEPLOYMENT.md](DEPLOYMENT.md)):
   - `RESEND_API_KEY` = the `re_...` key
   - `EMAIL_FROM` = e.g. `Baas.lk <noreply@baas.lk>` (must be on the verified domain)
6. Redeploy / restart notification-service so it picks up the new env.
7. End-to-end test: request a password reset for a real address, confirm the
   email arrives, click the link and confirm the reset completes.
8. Check rendering in Gmail + a common Sri Lankan inbox (e.g. `@sltnet.lk`) and
   that it doesn't land in spam.

## Notes

- `EMAIL_FROM` defaults to `Baas.lk <onboarding@resend.dev>` — replace it with a
  verified-domain address in production.
- Email links use the origin the gateway forwards as `x-origin` (falling back to
  `WEB_ORIGIN`), so links point at the right host per environment.
- Related code: `services/notification-service/src/lib/email.ts` (templates +
  SMTP/Resend/console send), `src/routes/email.ts` (auth endpoints),
  `src/routes/events.ts` + `src/lib/queue.ts` (marketplace-event ingestion +
  delivery queue). Auth-mail callers: identity-service (verify /
  password-reset / change-email #396 / account-exists #498 /
  email-change-attempt #503).
- **Marketplace notification emails** are queued per recipient by the events
  endpoint (one `notify:email` job each, EN/SI template chosen from the
  recipient's `locale`) and only for recipients whose `NotificationPreference`
  has email enabled. Fan-outs stay bounded upstream: `NEW_JOB_MATCH` ≤200
  matched providers per job (posting is gated on a verified email + daily cap,
  #556), `SAVED_SEARCH_MATCH` ≤200 saved-search owners with one alert per
  search per 24 h (#516 — see `docs/features/saved-searches.md`). A failed
  send retries 3 times with backoff, then drops with a logged error — email
  remains best-effort.
