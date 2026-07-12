# Jobs

## Jobs

Route: **`/admin/jobs`** and detail **`/admin/jobs/[id]`**
(`src/app/admin/jobs/**`, `AdminJobFilters.tsx`). **ADMIN-only page** (the page
redirects non-`ADMIN`; the job-service read endpoints themselves accept
`isSupportOrAdmin`).

Read-only oversight of the jobs reverse-marketplace (see
[FEATURES.md](../features/jobs.md)). `GET /api/admin/jobs`
lists jobs newest-first with customer name and response count hydrated; filters
by status (open/closed) and category. The detail view
(`GET /api/admin/jobs/{id}`) shows the job, budget, customer, description, and
the full response list (provider name/phone, message, link to the public
profile). There are no moderation actions on jobs — this section is for
visibility only.

---

## Monetization (deferred to v0.2)

There is **no billing in v0.1** — the platform is free to use. Pricing,
commission and payments are intentionally deferred to **v0.2**, so there is no
admin billing page, no transaction ledger, and no commission field on a job.

---

