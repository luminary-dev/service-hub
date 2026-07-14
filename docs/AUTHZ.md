# Authorization & RBAC

How Baas.lk decides **who may do what**. For the underlying authentication and
transport controls (session JWTs, revocation, S2S trust, rate limiting, CSRF,
headers, uploads) see [`../SECURITY.md`](../SECURITY.md). This document covers
roles, admin gating, the capability matrix, audit logging, and impersonation.

## Roles

A user's `role` is a claim in the session JWT (see `SECURITY.md`), forwarded to
services as `x-user-role` after the gateway verifies the token. There are two
end-user roles and two admin tiers:

| Role | Purpose |
| --- | --- |
| `CUSTOMER` | The default end-user role. Posting jobs, sending inquiries, leaving reviews and filing reports are gated on being signed in, not on this role (see "Role switching" below). |
| `PROVIDER` | A registered professional; owns a provider profile, photos, job responses. Can still do everything a customer can. |
| `SUPPORT` | Admin tier: **read** access to every `/admin` page, plus resolving / dismissing abuse reports. Nothing destructive. |
| `ADMIN` | Admin tier: **full** access — deletes, category edits, role changes, user management, plus everything SUPPORT can do. |

The admin tiers were introduced in #226 to split low-risk moderation (resolving
a report) from high-risk actions (deleting content, editing categories, changing
roles). An earlier unused admin value was dropped from the role CHECK set
(migration `20260708200000`) — `ADMIN` is the full-access tier. The role names
and the helper predicates live in
[`src/lib/roles.ts`](../src/lib/roles.ts):

### Sign-in methods (#398)

A user authenticates with **email + password** (bcrypt) or **social login**
(Google or Facebook OAuth, via `arctic`, inside identity-service). Either way
identity-service mints the same `sh_session` JWT — social login only resolves an
identity; roles, revocation (`sessionVersion`), and S2S trust are unchanged.
Each provider is a small adapter (`src/lib/oauth.ts`): Google uses PKCE + an
OIDC id_token; Facebook uses no PKCE and a Graph-API profile lookup. Both entry
points honor the same **per-account lockout** (the shared `lockedUntil` column —
failed-login window or an admin lock): a locked account is refused a session on
social login just as on password login (#641), bounced back to
`/login?error=oauth_locked`.

- Linked social identities live in the `Account` table (`(provider,
  providerAccountId)` → `userId`); a user may hold both a password and one or
  more OAuth identities.
- **Auto-linking** to a pre-existing account only happens on a provider-**verified**
  email (#635) — a matching verified email claims the existing account. Google
  supplies an explicit `email_verified` claim; **Facebook exposes no
  verification signal** at all (the Graph `/me` lookup returns only an address
  on file, which is not proof the person signing in controls it), so a
  Facebook-returned email is treated as **unverified** and is **never
  auto-linked to an existing account**. Treating mere presence as "verified"
  previously let a Facebook account carrying a victim's email silently claim the
  victim's existing password account — an account-takeover vector, now closed.
  When a Facebook email **collides** with an existing account the callback
  refuses (bounces back to `/login?error=oauth_email`): the user must sign in
  with their existing method (a confirm-to-link flow is a tracked follow-up).
  When it does **not** collide, a new CUSTOMER is created from the real address
  but left `emailVerified: null` until confirmed. A Facebook account that shares
  **no** email is never auto-linked either: it gets a new CUSTOMER keyed on the
  provider id with a non-deliverable placeholder email, which the user can later
  replace via the change-email flow (#396).
- Social signups have **no password** (`User.passwordHash` is nullable):
  password login returns the uniform 401, change-password directs them to the
  reset flow, and delete-account and change-email skip the password re-auth (the
  session is it). Accounts that **do** have a password must re-authenticate for
  every sensitive change — delete-account, change-password, and change-email
  (#504) — before it takes effect.
- **What delete-account erases (#650, PDPA):** identity orchestrates an S2S
  erase fan-out that deletes the user's *own* data (profile, photos, reviews,
  the inquiries/jobs they sent, notifications) but preserves the *other*
  party's data. Erasing a PROVIDER hard-deletes their profile + PII yet leaves
  the inquiries customers *sent* them intact but detached (`Inquiry.providerId`
  is `ON DELETE SET NULL`), shown as a "Deleted provider" thread. See
  `docs/architecture/data-model.md` (Erasure) for the full delete-vs-survive
  matrix.
- A first-time social signup starts as `CUSTOMER`; the `/welcome` chooser lets
  them convert to `PROVIDER` via `POST /api/auth/complete-provider` (which flips
  the role and bumps `sessionVersion`).

**Account enumeration is closed on the public auth entry points.** Login
returns a uniform 401 (with a dummy bcrypt compare so timing doesn't leak),
forgot-password always answers `{ ok: true }`, and **registration** (#373) no
longer 409s a taken email: a duplicate signup returns a generic `200
{ ok: true }` (no error, no `409 "already exists"` tell), creates no duplicate
user, and instead emails the real owner an "account already exists" notice
out-of-band (via notification-service) nudging them to sign in / reset. A dummy
bcrypt hash equalizes the taken-email branch with the create path's hashing cost
and the mail is fire-and-forget, so the branch isn't an obvious faster/earlier
return. (A genuinely new signup still creates the account and returns its
session, exactly as before — the same "success reveals nothing you didn't
already cause" property login has.)

**Registration keeps auto-login, so a residual oracle is blunted with bot
protection (#633).** Because a brand-new signup is auto-logged-in (a `sh_session`
cookie + a `{ user, providerId }` body) while a taken/duplicate email gets the
cookie-less `{ ok: true }`, the two responses are *not* byte-identical — a caller
can still, in principle, tell a fresh email from a taken one. Rather than removing
the auto-login (a UX regression), we gate the endpoint behind **Cloudflare
Turnstile** so the oracle cannot be *scripted* at scale on top of the existing
10/hr/IP throttle. When `TURNSTILE_SECRET_KEY` is set, `POST /api/auth/register`
requires a valid widget token (verified via Cloudflare's siteverify in
`identity-service/src/lib/turnstile.ts`) before any account work; a
missing/invalid token is a `400`, a siteverify outage a retryable `503` (fail
closed). It **degrades gracefully**: with the secret unset (dev/local, or a
deploy before keys are provisioned) verification is skipped and registration
behaves exactly as before. The web signup forms render the widget only when
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. Login and forgot-password could get the
same treatment later; they are already uniform-response, so this lands on
registration first. See [`../SECURITY.md`](../SECURITY.md) for the env config.

The same closure covers the **authenticated** change-email entry point (#503):
`POST /api/account/email/change` no longer 409s a target address that belongs to
another account. It returns the same generic `200 { ok: true }` whether or not
the address is taken, starts no change for a taken one, and instead emails the
real owner a "someone tried to move an account to your email" notice
out-of-band. Both branches fire their mail-and-forget it, so the taken branch
isn't measurably faster — a signed-in attacker gains no probe for which
addresses have accounts.

```
ADMIN_ROLES = ["ADMIN", "SUPPORT"]

isAdminRole(role)          // coarse gate: may this session enter /admin at all?
                           //   true for ADMIN, SUPPORT
hasFullAdminAccess(role)   // full access — deletes, category/role/user mgmt
                           //   true for ADMIN
hasSupportAccess(role)     // read + resolve/dismiss reports
                           //   true for ADMIN, SUPPORT
```

`ADMIN` implicitly has everything `SUPPORT` has (`hasSupportAccess` returns true
for it).

### Role switching & session-gated actions (#401–#404)

`CUSTOMER` and `PROVIDER` are not a hard partition — a user moves between them,
and the "customer" actions are gated on *being signed in*, not on the role:

- **Become a provider (#401):** any `CUSTOMER` converts via
  `POST /api/auth/complete-provider` (the `/welcome/provider` wizard). This is
  not social-signup-specific — it is the single upgrade path for password and
  OAuth users alike. It creates/reactivates the provider profile, flips
  `role → PROVIDER`, bumps `sessionVersion`, and re-issues the cookie. A
  profile under an **ADMIN suspension** (`adminSuspended`) is refused with 403
  and no role flip (#550): the downgrade→re-upgrade cycle must not lift a
  moderation suspension — only the admin unsuspend action does.
- **Revert to a customer (#403):** any `PROVIDER` downgrades via
  `POST /api/auth/leave-provider` — hides the provider profile (`suspended`,
  reversible; reviews/inquiries kept; an active ADMIN suspension survives),
  flips `role → CUSTOMER`, bumps `sessionVersion`, re-issues the cookie.
- **Session-gated actions (#402):** posting a job, sending an inquiry, and
  leaving a review are gated on `getAuth(c)` (signed-in), **not** on
  `role === "CUSTOMER"`. So a `PROVIDER` can also post jobs, inquire, and
  review; inquiries are additionally allowed anonymously. The role only governs
  provider-owned surfaces (dashboard, profile, job responses) and the admin
  tiers.

## Session revocation (#374)

Sessions are stateless JWTs (7-day TTL), so revoking one before it expires needs
an out-of-band signal. Every user carries a `User.sessionVersion`; each token
embeds the version it was minted with (`sv`), and identity-service **bumps** the
version on every revocation path:

- password change and password reset (`auth.ts`),
- logout-everywhere (`POST /api/auth/logout-all`),
- admin **force-logout**, **lock**, and **role change** (`admin-users.ts`).

The gateway rejects any token whose `sv` is below the user's current version
(`lib/proxy.ts` → `sessionVersionOk`). It resolves the current version from two
sources, in order:

1. **Shared Redis revocation list (authoritative).** On every bump identity
   publishes the new min-valid version to `revocation:<userId>` (a helper,
   `identity-service/src/lib/revocation.ts`, on the **same Redis the gateway
   uses for rate limiting**). The key carries a TTL of **8 days** (the 7-day
   session lifetime plus a buffer) so entries self-expire once every token
   minted before the bump has already expired. The gateway reads this key
   **without calling identity**, so a revoked token is rejected **even during an
   identity-service outage** — the previous fail-open gap (a revoked token
   honored for the outage duration once the ~60s cache expired) is closed for
   any user with a revocation entry.
2. **Identity lookup + in-memory cache (fallback).** When Redis has **no entry**
   for the user (the common case — most users never revoke a session) the
   gateway falls back to the S2S call to identity's
   `/internal/users/:id/session-version`, cached ~60s per user. This path still
   **fails open** if identity is unreachable, so an identity outage never signs
   the whole user base out.

Publishing is **best-effort**: identity writes to Redis after the DB bump has
committed, and a Redis error is swallowed and logged loudly (`log.error`) rather
than turned into a 500 for the user changing their password. The mutation still
succeeds and the gateway still catches the revocation via the fallback (2) until
the next successful publish.

**Residuals (accepted).**

- *Redis fully down.* The gateway degrades to (2) — today's behavior: a revoked
  token can be honored for up to the ~60s cache TTL **if identity is also down**.
  With identity up, revocation is immediate as before. The gateway logs the
  degraded Redis lookup once (edge-triggered `warn`, an alerting hook).
- *A single failed publish.* That one revocation isn't in the Redis list until
  the next successful bump for that user; the gateway still enforces it via the
  identity fallback. Logged loudly on the identity side.
- *A stale (present-but-lower) entry* can only arise from a failed publish; a
  successful publish always overwrites with the latest version, and the gateway
  trusts a present entry over the identity lookup by design (that is what buys
  outage-survival).

Impersonation tokens (#234/#358) run the **same** `sessionVersionOk` check for
both the target and the admin, so they inherit the Redis-first behavior too.

## How gating works

Authorization is enforced in two layers.

### 1. Web app — page & action gating (Next.js, server-side)

- **Coarse gate.** [`src/app/admin/layout.tsx`](../src/app/admin/layout.tsx) is
  the single choke point for the whole `/admin` section. It calls `getSession()`
  and:
  - no session → `redirect("/login")`
  - session but not an admin role (`!isAdminRole`) → `redirect("/")`

  Any authenticated ADMIN / SUPPORT session passes and reaches the admin UI with
  at least read access. (Per-page checks are also left in place as a
  defence-in-depth safety net, but the layout is the authoritative gate.)
- **Fine gates.** Individual destructive controls are gated per-component with
  `hasFullAdminAccess` / `hasSupportAccess`, so a SUPPORT user sees the admin
  pages but not the buttons for actions they can't perform.

This gating is UX and defence-in-depth. It is **server-rendered** (the session
is verified with the pinned HS256 algorithm and the revocation check runs), but
it decides what to *render* — it is not the last word on what a request may do.

### 2. Services — request authorization (backend)

The gateway forwards the verified identity as `x-user-id` / `x-user-role` /
`x-user-name`, trustworthy because of the internal-secret boundary (see
`SECURITY.md` → S2S trust). Services read it via `getAuth(c)`
(`services/*/src/lib/http.ts`) and enforce their own checks:

- **Ownership** checks compare `x-user-id` against the resource owner (e.g.
  review-service lets a review's author or an admin delete it —
  `services/review-service/src/routes/reviews.ts`).
- **Admin** checks look at `x-user-role` via the tier predicates in each
  service's `src/lib/http.ts`: **`isSupportOrAdmin`** (`ADMIN` or `SUPPORT`) for
  reads and report resolve/dismiss, **`isFullAdmin`** (`ADMIN` only) for
  destructive writes. These mirror the web-app predicates in `src/lib/roles.ts`.
  (A few destructive review handlers use an inline `auth.role === "ADMIN"`
  check, which is exactly what `isFullAdmin` evaluates — same result.)

The backend check is the authoritative one — the web gate can be bypassed by a
direct API call, but a request without the gateway-stamped identity headers, or
with an insufficient role, is rejected by the service.

## Admin capability matrix

What each tier can do, and the predicate enforcing it in **both** layers. "Web
UI" = the gate the frontend renders with; "Backend enforced" = the check the
owning service applies. The two agree.

| Capability | Tier | Web UI gate | Backend enforced by |
| --- | --- | --- | --- |
| Enter `/admin`; read the moderation pages (dashboard, providers, verifications, reports, categories) | SUPPORT+ | `isAdminRole` | `isSupportOrAdmin` |
| View verification documents (NIC / business-registration PII) | SUPPORT+ | (queue link) | `isSupportOrAdmin` (provider-service serve route, #500) |
| Resolve / dismiss abuse reports | SUPPORT+ | `hasSupportAccess` | `isSupportOrAdmin` |
| Provider moderation: verify / suspend / bulk actions | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| Verification queue: approve / reject | ADMIN | *(none — buttons render for SUPPORT too; the backend 403 is the gate)* | `isFullAdmin` (provider-service) |
| Delete / restore work photos (soft) | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| Delete / restore reviews (soft) | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (review-service) |
| Delete / restore inquiry thread messages (soft, #376) | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| Job takedown: hide / unhide (#376) | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (job-service) |
| Auto-flagging ("Run flagging") | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| Category create / edit / deactivate | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| User management: lock / unlock, role change, force-logout | ADMIN | `role === "ADMIN"` (page) | `isFullAdmin` (identity-service) |
| Jobs oversight, audit log | ADMIN | `role === "ADMIN"` (page) | `isSupportOrAdmin` (job/provider/review-service) |
| Impersonation ("view as") | ADMIN | `role === "ADMIN"` (page) | `isFullAdmin` (identity-service) |

Role changes (including assigning **`SUPPORT`**) go through
`PATCH /api/admin/users/:id`; the target role enum is
`CUSTOMER | PROVIDER | ADMIN | SUPPORT`, and any actual role change bumps
`sessionVersion` so the affected user's existing tokens are revoked and the new
role takes effect on their next request. Promoting a user to **PROVIDER**
requires an existing (possibly hidden) provider profile — without one the PATCH
is rejected with `400` (#554), because a profile-less PROVIDER account can
neither use the provider dashboard nor complete the signup wizard. **Locking an account
(`{ action: "lock" }`) bumps `sessionVersion` the same way**, so a locked user's
active sessions are cut off at the gateway immediately instead of surviving
until the JWT expires. A SUPPORT account can also be
bootstrapped without the UI via `create-admin -- --support` (see
`services/identity-service/prisma/create-admin.js`).

The **users, jobs, audit-log and impersonate** pages redirect any non-`ADMIN`
session at the page level (`session.role !== "ADMIN"`), so in practice they are
ADMIN-only surfaces today even though the underlying read endpoints for jobs and
the audit logs also accept SUPPORT. SUPPORT's working surface is the moderation
set: dashboard, providers, verifications, reports and categories (read-only,
plus report resolve/dismiss).

Backend admin routes live in:
`services/provider-service/src/routes/admin.ts`,
`services/identity-service/src/routes/{admin.ts,admin-users.ts,admin-impersonation.ts}`,
`services/job-service/src/routes/{admin.ts,reports.ts}`,
`services/review-service/src/routes/{reports.ts,reviews.ts}`.

## Audit log

Every admin **write** in provider-service is recorded to `AdminAuditLog`
(#227) via a best-effort `logAudit(...)` after the action succeeds
(`services/provider-service/src/routes/admin.ts`). A logging failure never rolls
back or blocks the moderation action itself. The **bulk** variants (bulk
suspend/unsuspend, bulk verification approve/reject, bulk report
resolve/dismiss) record **one entry per affected target**, using the same
action names as their single-item counterparts.

- **Recorded fields:** `adminId` (from `x-user-id`), `action` (e.g. `verify`,
  `suspend`, `delete-photo`, `restore-photo`, `create-category`, `edit-category`,
  `resolve-report`, `dismiss-report`, `reject-verification`), `targetType`,
  `targetId`, optional `reason`, `createdAt`.
- **Read API:** `GET /api/admin/audit-log` (last 200 entries, filterable by
  `adminId`, `action`, and a `from`/`to` date range).
- **Report closures** additionally stamp `resolvedBy` / `resolvedAt` on the
  report row itself.
- review-service and job-service keep their **own** audit logs for the
  actions they own (exposed at `GET /api/admin/review-audit-log` and
  `GET /api/admin/job-audit-log` — the latter records `hide-job`/`unhide-job`
  takedowns (#376) alongside job-report closures); the admin frontend merges
  the three.

## Impersonation ("view as")

Admins can briefly assume a target user's session to reproduce an issue from
their perspective (#234). Implemented in
`services/identity-service/src/routes/admin-impersonation.ts` and
`services/identity-service/src/lib/session.ts`.

- **Distinct cookie.** Impersonation issues a separate `impersonation_session`
  cookie, **never** touching the admin's own `sh_session`. Ending impersonation
  (`POST /api/admin/impersonate/end`, or expiry) just clears the extra cookie
  and requests fall straight back to the admin's real identity.
- **Short-lived.** The impersonation token always expires in **15 minutes**,
  regardless of the normal 7-day session TTL.
- **Revocable via both parties (#358).** The token carries the **target's** and
  the **admin's** `sessionVersion` at mint time (`sv` and `impersonatedBySv`);
  the gateway and the web verifier honor the impersonation only while *both* are
  still current. So force-logging-out / resetting the password of either the
  target **or the impersonating admin** kills an active impersonation
  immediately, not just at the 15-minute expiry.
- **Unmistakable.** The token carries an `impersonatedBy` claim (the admin's
  `userId`); a token missing it is not accepted as an impersonation token even
  if otherwise validly signed. The gateway forwards it as `x-impersonated-by`,
  and a valid impersonation cookie takes priority over `sh_session` at both the
  gateway (`proxy.ts`) and the web app (`src/lib/auth.ts`) so server-rendered
  pages see the target's identity with `impersonatedBy` set (for the "viewing
  as" banner).
- **Guardrails.** An admin cannot impersonate their own account, and cannot
  impersonate another **admin-tier** account — `ADMIN` **or** `SUPPORT` (#654,
  defence in depth: one admin session never rides in as another admin, of
  either tier). The check reuses the `isAdminTierRole` role predicate in
  `lib/http.ts` rather than a hardcoded `=== "ADMIN"` string.
- **Irreversible self-service ops are blocked while impersonating (#634).**
  Impersonation is a read-mostly "view as"; it must not become a way to
  irreversibly act on someone else's account. The **gateway** — the single
  public entry — rejects these POSTs with **403** whenever an impersonation
  session is in effect (i.e. it has verified the impersonation cookie and
  stamped `x-impersonated-by`): account deletion (`/api/auth/delete-account`),
  login-email change (`/api/account/email/change`, `/api/account/email/confirm`),
  and reverting the provider role (`/api/auth/leave-provider`). The guard lives
  centrally in the gateway (`lib/routes.ts` `isImpersonationBlocked` +
  `lib/proxy.ts`) so the blocked set can't drift per-service; everything else
  stays usable so the admin can still reproduce the target's experience. A
  non-impersonated (real) session is unaffected.
- **Logged.** Every start writes an `ImpersonationLog` row (`adminId`,
  `targetUserId`, `startedAt`); `/end` best-effort stamps `endedAt` on the open
  row. This is a standalone log for the feature and is intended to be reconciled
  with the general `AdminAuditLog` (#227) later. Separately, any identity
  `AdminAuditLog` write taken *while impersonating* records the real admin in a
  nullable **`impersonatedBy`** column (#634): under impersonation the row's
  `adminId` is the impersonated **target** (the effective session identity), so
  `impersonatedBy` — sourced from the gateway-stamped `x-impersonated-by` header
  in `logAudit` — is what attributes the action to the admin who actually drove
  it. Cross-service audit attribution (provider/review/job keep their own
  `AdminAuditLog`) is a tracked follow-up; in practice those admin writes are
  unreachable under impersonation anyway, since impersonation forwards the
  target's (non-admin) role and the destructive handlers gate on `isFullAdmin`.

## Tier enforcement is end-to-end

The tiered admin roles are enforced in **both** the web app and the backend
services — the two layers agree.

- The web coarse gate (`isAdminRole`) admits **ADMIN and SUPPORT** into `/admin`,
  then per-component `hasFullAdminAccess` / `hasSupportAccess` gates decide which
  controls render.
- Every backend admin endpoint gates on the matching predicate from its
  `src/lib/http.ts`: `isSupportOrAdmin` (`ADMIN` or `SUPPORT`) for reads and
  report resolve/dismiss, `isFullAdmin` (`ADMIN` only) for destructive writes.
  The same predicates are used in provider-service (`admin.ts`), identity-service
  (`admin-users.ts`, `admin-impersonation.ts`), job-service (`admin.ts`), and
  review-service (`reports.ts` / `reviews.ts`).

A **SUPPORT** user can enter `/admin`, read every view, and resolve/dismiss
reports; any destructive action they attempt is rejected with **403
`{ "error": "Forbidden" }`** at the service. An **ADMIN** user has full access.
