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
| `CUSTOMER` | Books services, posts jobs, leaves reviews, files reports. |
| `PROVIDER` | A registered professional; owns a provider profile, photos, job responses. |
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
OIDC id_token; Facebook uses no PKCE and a Graph-API profile lookup.

- Linked social identities live in the `Account` table (`(provider,
  providerAccountId)` → `userId`); a user may hold both a password and one or
  more OAuth identities.
- **Auto-linking** only happens on a provider-**verified** email — an existing
  account is claimed by a matching verified email. Google supplies an explicit
  `email_verified` claim; Facebook has none, so a Facebook-returned email is
  treated as verified (Facebook verifies emails on file — a slightly weaker
  guarantee, accepted for auto-linking). A Facebook account that shares **no**
  email is never auto-linked: it gets a new CUSTOMER keyed on the provider id
  with a non-deliverable placeholder email, which the user can later replace via
  the change-email flow (#396).
- Social signups have **no password** (`User.passwordHash` is nullable):
  password login returns the uniform 401, change-password directs them to the
  reset flow, and delete-account skips the password re-auth (the session is it).
- A first-time social signup starts as `CUSTOMER`; the `/welcome` chooser lets
  them convert to `PROVIDER` via `POST /api/auth/complete-provider` (which flips
  the role and bumps `sessionVersion`).

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
| Resolve / dismiss abuse reports | SUPPORT+ | `hasSupportAccess` | `isSupportOrAdmin` |
| Provider moderation: verify / suspend / bulk actions | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| Verification queue: approve / reject | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| Delete / restore work photos (soft) | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| Delete / restore reviews (soft) | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (review-service) |
| Auto-flagging ("Run flagging") | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| Category create / edit / deactivate | ADMIN | `hasFullAdminAccess` | `isFullAdmin` (provider-service) |
| User management: lock / unlock, role change, force-logout | ADMIN | `role === "ADMIN"` (page) | `isFullAdmin` (identity-service) |
| Jobs oversight, audit log | ADMIN | `role === "ADMIN"` (page) | `isSupportOrAdmin` (job/provider/review-service) |
| Impersonation ("view as") | ADMIN | `role === "ADMIN"` (page) | `isFullAdmin` (identity-service) |

The **users, jobs, audit-log and impersonate** pages redirect any non-`ADMIN`
session at the page level (`session.role !== "ADMIN"`), so in practice they are
ADMIN-only surfaces today even though the underlying read endpoints for jobs and
the audit logs also accept SUPPORT. SUPPORT's working surface is the moderation
set: dashboard, providers, verifications, reports and categories (read-only,
plus report resolve/dismiss).

Backend admin routes live in:
`services/provider-service/src/routes/admin.ts`,
`services/identity-service/src/routes/{admin.ts,admin-users.ts,admin-impersonation.ts}`,
`services/job-service/src/routes/admin.ts`,
`services/review-service/src/routes/reports.ts`.

## Audit log

Every admin **write** in provider-service is recorded to `AdminAuditLog`
(#227) via a best-effort `logAudit(...)` after the action succeeds
(`services/provider-service/src/routes/admin.ts`). A logging failure never rolls
back or blocks the moderation action itself.

- **Recorded fields:** `adminId` (from `x-user-id`), `action` (e.g. `verify`,
  `suspend`, `delete-photo`, `restore-photo`, `create-category`, `edit-category`,
  `resolve-report`, `dismiss-report`, `reject-verification`), `targetType`,
  `targetId`, optional `reason`, `createdAt`.
- **Read API:** `GET /api/admin/audit-log` (last 200 entries, filterable by
  `adminId`, `action`, and a `from`/`to` date range).
- **Report closures** additionally stamp `resolvedBy` / `resolvedAt` on the
  report row itself.
- review-service keeps its **own** audit log for the review actions it owns
  (exposed at `GET /api/admin/review-audit-log`); the admin frontend merges the
  two.

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
- **Unmistakable.** The token carries an `impersonatedBy` claim (the admin's
  `userId`); a token missing it is not accepted as an impersonation token even
  if otherwise validly signed. The gateway forwards it as `x-impersonated-by`,
  and a valid impersonation cookie takes priority over `sh_session` at both the
  gateway (`proxy.ts`) and the web app (`src/lib/auth.ts`) so server-rendered
  pages see the target's identity with `impersonatedBy` set (for the "viewing
  as" banner).
- **Guardrails.** An admin cannot impersonate their own account, and cannot
  impersonate another `ADMIN` account (defence in depth — one admin session
  never rides in as another).
- **Logged.** Every start writes an `ImpersonationLog` row (`adminId`,
  `targetUserId`, `startedAt`); `/end` best-effort stamps `endedAt` on the open
  row. This is a standalone log for the feature and is intended to be reconciled
  with the general `AdminAuditLog` (#227) later.

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
