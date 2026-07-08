# identity-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/identity-service`](https://github.com/luminary-dev/service-hub/tree/main/services/identity-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Owns users, sessions, email-verification / password-reset tokens, and provider
favorites for Service Hub (Baas.lk). It is the **only** signer of the
`sh_session` JWT cookie (HS256 via `AUTH_SECRET`); the api-gateway and web app
only verify it. Runs on port **4001** with its own `identity_db` Postgres
database.

Never exposed publicly — every request except `/healthz` must carry
`x-internal-secret` (constant-time checked). Authenticated identity arrives via
the gateway-forwarded `x-user-id` / `x-user-role` / `x-user-name` headers.

## Endpoints

### Public — auth (`/api/auth`, via gateway)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create a CUSTOMER or PROVIDER account. Providers are orchestrated S2S into provider-service; on failure the user is compensating-deleted and 502 returned. Sets session cookie. |
| POST | `/api/auth/login` | Verify credentials (constant-time; per-account lockout), set session cookie. Returns `{ user, providerId }`. |
| POST | `/api/auth/logout` | Clear the session cookie. |
| POST | `/api/auth/logout-all` | Bump `sessionVersion` (revokes every existing session), re-issue a fresh cookie for the caller. |
| GET | `/api/auth/me` | Current user, or `{ user: null }` without a session. |
| POST | `/api/auth/change-password` | Verify current password, set new hash, bump `sessionVersion`, re-issue cookie. |
| POST | `/api/auth/delete-account` | Self-service erasure: re-auth, fan erase out to peer services, then delete the local row + write an `AccountDeletion` audit row (502 if a peer erase fails). |
| POST | `/api/auth/verify-email` | Consume an email-verification token. |
| POST | `/api/auth/resend-verification` | Re-send the verification email (session required). |
| POST | `/api/auth/forgot-password` | Issue a reset token + email; always `{ ok: true }` (anti-enumeration). |
| POST | `/api/auth/reset-password` | Consume a reset token, set a new password, bump `sessionVersion`. |

### Public — favorites (`/api/favorites`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/favorites` | `{ providerIds }` for the session user, newest first. |
| POST | `/api/favorites/:id` | Favorite a provider (S2S existence check). |
| DELETE | `/api/favorites/:id` | Unfavorite a provider. |

### Admin (reads require SUPPORT or ADMIN via `isSupportOrAdmin`; user-management + impersonation writes require full ADMIN via `isFullAdmin`; else 403)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users?q=&page=` | Search users by email/name, paginated (SUPPORT+) (#220). |
| GET | `/api/admin/users/:id` | User detail + favorites hydrated with provider names/phones (SUPPORT+) (#220). |
| PATCH | `/api/admin/users/:id` | Full ADMIN; lock/unlock and/or change role `CUSTOMER`\|`PROVIDER`\|`ADMIN` (blocks acting on yourself) (#220). |
| POST | `/api/admin/users/:id/force-logout` | Full ADMIN; bump the target's `sessionVersion` (#220). |
| POST | `/api/admin/impersonate/:userId` | Start "view as" — issues a 15-min `impersonation_session` cookie, writes an `ImpersonationLog` row (rejects self / another admin) (#234). |
| POST | `/api/admin/impersonate/end` | Destroy the impersonation cookie, close the log row (#234). |
| GET | `/api/admin/signups` | Daily signup counts for the trailing 30 days, split customer vs provider (#219). |

### Internal (service-to-service, `/internal/users`)

| Method | Path | Description |
|---|---|---|
| GET | `/internal/users?ids=a,b,c` | Batch user hydration (capped 500) `{ users: [{ id, name, email, phone, emailVerified }] }`. |
| GET | `/internal/users/:id/session-version` | `{ v }` — the gateway's revocation check (`null` if the user is gone). |
| GET | `/internal/users/count` | `{ count }`. |
| PATCH | `/internal/users/:id` | `{ name?, phone? }` profile sync from provider-service. |

`GET /healthz` → `{ ok: true, service: "identity-service" }` (no secret; checks Postgres).

## Data ownership (`prisma/schema.prisma`)

- **User** — account: `email`, `passwordHash`, `name`, `phone?`, `role`, `emailVerified?`, `sessionVersion` (revocation counter), `failedLogins` / `lockedUntil?` (lockout).
- **Favorite** — a user's favorited provider (`userId` FK, `providerId` cross-service ref); unique per pair.
- **PasswordResetToken** / **EmailVerificationToken** — hashed single-use tokens (sha256; raw never stored) with expiry, FK to User (cascade).
- **AccountDeletion** — audit trail for self-service deletion (#123); no FK (survives the deleted user).
- **ImpersonationLog** — audit trail for admin "view as" (#234): `adminId`, `targetUserId`, `startedAt`, `endedAt?`.

## Roles & session-version

`User.role` is a plain string (default `CUSTOMER`). Self-registration allows
only `CUSTOMER` / `PROVIDER`; the admin role-change API additionally assigns
`ADMIN` (SUPPORT is set out-of-band in the DB). The two-tier admin model
(`ADMIN` | `SUPPORT`, #226; an earlier unused admin value was removed by
migration `20260708200000`) is enforced by a DB CHECK constraint and end-to-end
in both layers: the web app's `src/lib/roles.ts` and
this service's `src/lib/http.ts` (`isSupportOrAdmin` for reads, `isFullAdmin`
for the destructive user-management and impersonation writes).

`sessionVersion` is the revocation counter: the JWT carries `sv` at mint time,
and `logout-all`, `change-password`, `reset-password` and admin `force-logout`
all increment it. The gateway checks it via `GET /internal/users/:id/session-version`.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4001` | Listen port |
| `DATABASE_URL` | — (required) | Postgres (`identity_db`) |
| `AUTH_SECRET` | `dev-only-secret` (throws in production if unset) | HS256 secret for the `sh_session` JWT |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (throws in production if unset) | Shared S2S secret |
| `PROVIDER_SERVICE_URL` | `http://localhost:4002` | Registration orchestration, favorites check |
| `REVIEW_SERVICE_URL` | `http://localhost:4003` | Account-deletion erase fan-out |
| `JOB_SERVICE_URL` | `http://localhost:4004` | Account-deletion erase fan-out |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:4005` | Verification / reset emails |
| `WEB_ORIGIN` | `http://localhost:3000` | Fallback origin for email links (normally the `x-origin` header) |

## Gateway / S2S model

Only the api-gateway is public. This service creates provider profiles on
registration and fans account-deletion erasure out to provider / review / job
services (`POST /internal/users/:id/erase` on each — all must succeed or the
delete aborts). Outbound calls attach `x-internal-secret` with bounded timeouts
and a single retry on idempotent reads.

## Local development

```sh
cp .env.example .env
npm install                   # also runs prisma generate
npm run db:push               # create tables in identity_db
npm run db:seed               # demo users (password123), deterministic ids
npm run dev                   # tsx watch on :4001
```

Other scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm start`,
`npm run start:migrate` (Docker: migrate then start).
