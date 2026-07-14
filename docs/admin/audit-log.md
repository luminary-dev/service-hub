# Audit log


Route: **`/admin/audit-log`** (`src/app/admin/audit-log/page.tsx`). **ADMIN-only
page** (the page redirects non-`ADMIN`; the audit-log read endpoints themselves
accept `isSupportOrAdmin`).

A read-only, newest-first history of the **provider, review and job
moderation actions**. It merges three sources and re-sorts:

- `GET /api/admin/audit-log` (provider-service) — provider verify/suspend,
  photo/message delete (#376), report resolve/dismiss, category create/edit.
- `GET /api/admin/review-audit-log` (review-service) — review delete, review-
  report resolve/dismiss.
- `GET /api/admin/job-audit-log` (job-service) — job hide/unhide (#376),
  job-report resolve/dismiss (#375).

Every admin write across the services calls a best-effort `logAudit` that
records the **admin id, action, target type/id, timestamp, and reason** (when
present). Each row shows a target-type chip, the action, and a meta line with
the timestamp, admin id, and target. Filters: admin id, action, from/to date (a
bare `to` date is extended to end-of-day for inclusive ranges).

identity-service's user-management actions (lock/unlock, role change, force
logout, leave-provider) are audited to its own `AdminAuditLog` table but have
no read endpoint yet, so they don't appear on this page; impersonation has
its own separate `ImpersonationLog` (see [Impersonation](impersonation.md)).

---

