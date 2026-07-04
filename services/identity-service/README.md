# identity-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/identity-service`](https://github.com/luminary-dev/service-hub/tree/main/services/identity-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Owns users, sessions, email verification / password reset tokens, and
favorites for Service Hub (Baas.lk). It is the **only** signer of the
`sh_session` JWT cookie (HS256 via `AUTH_SECRET`); the api-gateway and the web
app verify it. Runs on port **4001** with its own `identity_db` Postgres
database.

Never exposed publicly — every request must come through the api-gateway (or a
sibling service) carrying `x-internal-secret`. Authenticated user identity
arrives via the gateway-forwarded `x-user-id` / `x-user-role` / `x-user-name`
headers.

## Endpoints

### Public (via gateway)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account (CUSTOMER or PROVIDER). Providers are orchestrated S2S into provider-service; on failure the user is compensating-deleted and 502 returned. Sets session cookie. |
| POST | `/api/auth/login` | Verify credentials, set session cookie. Returns `{ user, providerId }`. |
| POST | `/api/auth/logout` | Clear session cookie. |
| GET | `/api/auth/me` | Current user (`{ user: null }` without a session). |
| POST | `/api/auth/verify-email` | Consume an email-verification token. |
| POST | `/api/auth/resend-verification` | Re-send the verification email (session required). |
| POST | `/api/auth/forgot-password` | Issue a password-reset token + email (anti-enumeration: always `{ ok: true }`). |
| POST | `/api/auth/reset-password` | Consume a reset token, set a new password. |
| GET | `/api/favorites` | `{ providerIds }` for the session user, newest first. |
| POST | `/api/favorites/:id` | Favorite a provider (S2S existence check). |
| DELETE | `/api/favorites/:id` | Unfavorite a provider. |

### Internal (service-to-service)

| Method | Path | Description |
|---|---|---|
| GET | `/internal/users?ids=a,b,c` | Batch user hydration `{ users: [{ id, name, email, phone, emailVerified }] }`. |
| GET | `/internal/users/count` | `{ count }`. |
| PATCH | `/internal/users/:id` | `{ name?, phone? }` profile sync from provider-service. |

### Operational

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | `{ ok: true, service: "identity-service" }` (no secret required). |

## Environment variables

| Var | Purpose | Default |
|---|---|---|
| `PORT` | Listen port | `4001` |
| `DATABASE_URL` | Postgres connection string | — (required) |
| `AUTH_SECRET` | HS256 secret for the `sh_session` JWT | `dev-only-secret` (throws at startup if unset in production) |
| `INTERNAL_API_SECRET` | Shared S2S secret | `dev-internal-secret` |
| `PROVIDER_SERVICE_URL` | provider-service base URL | `http://localhost:4002` |
| `NOTIFICATION_SERVICE_URL` | notification-service base URL | `http://localhost:4005` |
| `WEB_ORIGIN` | Fallback origin for email links (normally `x-origin` header) | `http://localhost:3000` |

## Local development

```sh
cp .env.example .env          # adjust if needed
npm install                   # also runs prisma generate
npm run db:push               # create tables in identity_db
npm run db:seed               # demo users (password123), deterministic ids
npm run dev                   # tsx watch on :4001
```

Other scripts: `npm run typecheck`, `npm test`, `npm run build`,
`npm start` (built output), `npm run start:migrate` (used by Docker: `prisma
db push` then start).

Quick smoke test (the internal secret is required on everything but
`/healthz`):

```sh
curl http://localhost:4001/healthz
curl -H "x-internal-secret: dev-internal-secret" \
  -H "content-type: application/json" \
  -d '{"email":"dilani@example.com","password":"password123"}' \
  http://localhost:4001/api/auth/login
```
