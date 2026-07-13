# Accessing the panel & dashboard


- URL: **`/admin`** (Sinhala: `/si/admin`).
- The whole section is gated by `src/app/admin/layout.tsx`: no session →
  redirect to `/login`; a session whose role is not an admin tier → redirect to
  `/`. This is a coarse "can you enter `/admin` at all" gate; every admin page
  also keeps its own per-page check as a safety net.
- All admin pages are `force-dynamic` (no-store) so a moderation edit shows up
  on the next request.

### Role tiers

Defined in `src/lib/roles.ts` (`ADMIN_ROLES = ["ADMIN", "SUPPORT"]`). The
identity DB stores `role` as plain text with a CHECK constraint allowing
`CUSTOMER | PROVIDER | ADMIN | SUPPORT` (the role set was finalized by migration
`20260708200000`, which dropped an earlier unused admin value). The gateway
forwards the role to services as `x-user-role`.

| Tier | Access |
| --- | --- |
| **SUPPORT** | Read access to the moderation pages, plus resolving/dismissing abuse reports. Nothing destructive. |
| **ADMIN** | Full access: deletes, category edits, role changes, user management, everything SUPPORT can do. |

Gating helpers: `isAdminRole()` (enter `/admin`), `hasSupportAccess()`
(resolve/dismiss reports), `hasFullAdminAccess()` (destructive actions).

**Enforcement is end-to-end (#226).** The tiers are honored in **both** the web
app and the backend services — see [AUTHZ.md](../AUTHZ.md). Each service's
`src/lib/http.ts` exposes `isSupportOrAdmin` (reads + report resolve/dismiss) and
`isFullAdmin` (destructive writes), mirroring the web predicates. On the
**dashboard, verifications, reports, providers, and categories** pages SUPPORT
sees read-only/disabled controls while ADMIN can act. The **users, jobs,
audit-log, and impersonate** pages redirect any non-`ADMIN` session at the page
level, so they are ADMIN-only surfaces; a pure SUPPORT account works the
moderation set above.

---

## Dashboard

Route: **`/admin`** (`src/app/admin/page.tsx`,
`src/components/admin/AdminDashboardCharts.tsx`).

The home screen is the metrics view plus the nav grid. It fetches four
sources in parallel, each degrading to zeros rather than erroring:

- `GET /api/admin/stats` (provider-service) — active/suspended/total providers,
  `pendingVerifications`, `openReports`, `categoryDistribution`.
- `GET /api/admin/review-stats` (review-service) — review-side open reports.
- `GET /api/admin/job-reports/count` (job-service, #375) — job-side open
  reports.
- `GET /api/admin/signups` (identity-service) — 30-day daily signup series and
  totals split by customers vs providers.

**Stat tiles:** total signups, pending verifications, open reports (provider +
review + job reports summed), active providers, suspended providers.

**Charts** (recharts, colored from CSS vars so they follow dark mode):

- Signups line chart — two lines, customers vs providers, by day.
- Top categories bar chart — the 8 largest categories by provider count, labels
  localized EN/SI.

**Nav grid:** cards linking to Providers, Verifications, Categories, Reports,
Audit log, Jobs, and Users. The Verifications and Reports cards carry a live
notification badge (see [Notifications](notifications-and-bootstrap.md)).

---

