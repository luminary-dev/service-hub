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
  `sessionVersion`, forcing a re-login on their next request).
- **Lock / unlock** — `PATCH /api/admin/users/{id}` `{ action }`. Lock sets a
  far-future `lockedUntil` (effectively permanent manual lock, reusing the same
  column as the 5-strike / 15-minute auto-lockout); unlock clears it and resets
  the failed-login counter.
- **Force logout** — `POST /api/admin/users/{id}/force-logout` bumps the user's
  `sessionVersion`, invalidating every existing token at the gateway's
  revocation check.

You cannot modify or force-logout your own account (the API returns 400).

---

