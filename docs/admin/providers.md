# Providers


Route: **`/admin/providers`** and detail **`/admin/providers/[id]`**
(`src/app/admin/providers/**`, `AdminProvidersList.tsx`,
`AdminProvidersFilterBar.tsx`, `AdminProviderActions.tsx`,
`AdminDeleteButton.tsx`, `AdminRestoreButton.tsx`). Destructive actions gated by
`hasFullAdminAccess`; SUPPORT sees disabled controls.

**List** — `GET /api/admin/providers` with `q`, `category`, `city`, verification
`status`, `suspended`, `sort` (`newest` / `mostReviews`), and pagination
(`PAGE_SIZE = 20`). Rows show verified/pending/suspended chips, the quality-
score badge, category/city, review and photo counts, and a Moderate link.

- **Per-row actions:** verify / unverify and suspend / unsuspend, via
  `PATCH /api/admin/providers/{id}` with `{ action }`.
- **Bulk actions:** select-all + bulk suspend / unsuspend, via
  `PATCH /api/admin/providers` with `{ ids, suspended }`.

**Detail** — `GET /api/admin/providers/{id}`: header with avatar, contact, the
quality badge and breakdown, and the verify/suspend actions. Two panels:

- **Reviews** — each review has a delete control
  (`DELETE /api/admin/reviews/{id}`, a soft delete server-side); soft-deleted
  reviews show a **Restore** control.
- **Work photos** — grid with per-photo delete
  (`DELETE /api/admin/photos/{id}`, a soft delete that sets `deletedAt`; a
  provider deleting their own photo is a hard delete); soft-deleted photos show a
  **Restore** control.

**Restore.** `AdminRestoreButton` wires the restore endpoints directly from this
detail view: `PATCH /api/admin/photos/{id}/restore` (provider-service, clears
`deletedAt`) and `PATCH /api/admin/reviews/{id}/restore` (review-service). Both
are full-admin gated (`hasFullAdminAccess` in the UI, `isFullAdmin` server-side),
so SUPPORT sees a disabled control; restoring re-publishes the content and is
audited (`restore-photo` / `restore-review`).

---

