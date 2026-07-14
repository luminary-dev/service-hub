# Admin surface (roles and audit)


- **Role tiers (#226):** `User.role` allows `CUSTOMER | PROVIDER | ADMIN |
  SUPPORT` (CHECK constraint). There are two admin tiers, enforced **end-to-end**
  (web + backend):
  - **ADMIN** — full access: destructive moderation (verify/suspend, verification
    approve/reject, photo & review delete/restore, inquiry-message
    delete/restore and job hide/unhide takedown #376, auto-flagging), category
    edits, user management, role changes, and impersonation.
  - **SUPPORT** — read access to every admin view, plus resolving/dismissing
    abuse reports. Nothing destructive.

  The **web app** gates the `/admin` UI via `src/lib/roles.ts`: `isAdminRole`
  (coarse `/admin` access for ADMIN/SUPPORT), `hasFullAdminAccess` (ADMIN — the
  destructive actions above), `hasSupportAccess` (ADMIN or SUPPORT — read +
  report resolve/dismiss). The **backend services enforce the same split**: each
  service's `src/lib/http.ts` exposes `isFullAdmin` (role === `ADMIN`) and
  `isSupportOrAdmin` (`ADMIN` or `SUPPORT`), and every admin route gates on the
  matching predicate — reads and report resolve/dismiss on `isSupportOrAdmin`,
  destructive writes on `isFullAdmin`. The web gate is UX/defence-in-depth; the
  service check is the authoritative one.
- **Audit trail (#227/#223):** provider-, review- and job-service each keep an
  `AdminAuditLog` (one row per moderation write) exposed at
  `/api/admin/audit-log`, `/api/admin/review-audit-log` and
  `/api/admin/job-audit-log`; abuse reports also
  carry `resolvedBy`/`resolvedAt`. The frontend merges those three logs
  client-side (trust-safety-service's unified log will replace the merge after
  its cutover — dark today). identity-service records to its own `AdminAuditLog` too
  (self-service actions #403) but does not yet expose or merge it.
  Impersonation keeps its own `ImpersonationLog` (identity-service) —
  intentionally separate for now, to be reconciled with the general audit log
  later.

