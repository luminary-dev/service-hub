# Jobs

## Jobs

Route: **`/admin/jobs`** and detail **`/admin/jobs/[id]`**
(`src/app/admin/jobs/**`, `AdminJobFilters.tsx`). **ADMIN-only page** (the page
redirects non-`ADMIN`; the job-service read endpoints themselves accept
`isSupportOrAdmin`).

Oversight of the jobs reverse-marketplace (see
[FEATURES.md](../features/jobs.md)). `GET /api/admin/jobs`
lists jobs newest-first with customer name and response count hydrated; filters
by status (open/closed) and category. The detail view
(`GET /api/admin/jobs/{id}`) shows the job, budget, customer, description, and
the full response list (provider name/phone, message, link to the public
profile).

**Takedown (#376).** A full admin can take down a reported (scam/abusive) job
from the detail view — `PATCH /api/admin/jobs/{id}` with
`{ action: "hide" | "unhide" }` (`AdminJobTakedownButton.tsx`, disabled for
SUPPORT). Hiding stamps `hiddenAt`: the job disappears from the provider board,
stops accepting responses, and can no longer be reported; the list and detail
views flag it with a **Taken down** chip. The action is reversible (unhide) and
audit-logged (`hide-job` / `unhide-job`). Job abuse reports — user-filed (#376)
and content-filter flags on job posts/responses (#375) — land in the shared
[reports queue](moderation.md#reports-queue) via job-service's
`/api/admin/job-reports`, whose rows deep-link back to the job detail here.

---

## Monetization (deferred to v0.2)

There is **no billing in v0.1** — the platform is free to use. Pricing,
commission and payments are intentionally deferred to **v0.2**, so there is no
admin billing page, no transaction ledger, and no commission field on a job.

---

