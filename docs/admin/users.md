# Users


Route: **`/admin/users`** and detail **`/admin/users/[id]`**
(`src/app/admin/users/**`, `AdminUserActions.tsx`). **ADMIN-only page** — the
page redirects any non-`ADMIN` session, and identity-service gates its
destructive writes on `isFullAdmin` (SUPPORT is redirected away).

**List** — `GET /api/admin/users?q=&page=` (page size 20): case-insensitive
search over email/name, newest first. Rows show role and locked chips and a
Moderate link.

**Detail** — `GET /api/admin/users/{id}`: role, joined date, locked state,
session version, and the user's favorites. Actions (hidden when viewing your
own account):

- **Change role** — CUSTOMER / PROVIDER / ADMIN / SUPPORT via
  `PATCH /api/admin/users/{id}` `{ role }` (a role change bumps the user's
  `sessionVersion`, forcing a re-login on their next request). A change that
  crosses the PROVIDER boundary mirrors the self-service flows so
  provider-service stays consistent: demoting **PROVIDER → non-PROVIDER**
  deactivates (hides) their provider profile, and promoting **non-PROVIDER →
  PROVIDER** reactivates an existing hidden profile (no-op if none exists — they
  complete the provider wizard later). The provider-service call is a write-path
  gate: if it fails the API returns `502` and the role is left unchanged, so the
  two services never drift. Role changes that don't involve PROVIDER (e.g.
  CUSTOMER ↔ ADMIN ↔ SUPPORT) make no provider-service call.
- **Lock / unlock** — `PATCH /api/admin/users/{id}` `{ action }`. Lock sets a
  far-future `lockedUntil` (effectively permanent manual lock, reusing the same
  column as the 5-strike / 15-minute auto-lockout) **and bumps the user's
  `sessionVersion`, so any already-issued token is revoked at the gateway
  immediately rather than surviving until the JWT expires**; unlock clears the
  lock and resets the failed-login counter (it does not touch `sessionVersion`).
- **Force logout** — `POST /api/admin/users/{id}/force-logout` bumps the user's
  `sessionVersion`, invalidating every existing token at the gateway's
  revocation check.

You cannot modify or force-logout your own account (the API returns 400).

---

