# Jobs (reverse-marketplace)


Instead of only browsing providers, a customer can post a job and let scoped
providers come to them. Frontend under `src/app/jobs/**`; backend in
job-service. All jobs pages require a session.

### Posting a job

**`/jobs/new`** (`JobPostForm`) → `POST /api/jobs`: category (validated against
the live category list), district (one of the 25), title (5–100), description
(10–2000), optional budget (Rs. 100–100,000,000). Posting is rate-limited.

### The provider job board — response scoping

**`/jobs`** shows a provider their matching board via `GET /api/jobs/board`.
**Scoping rule:** the board returns only **OPEN** jobs where the job's
**category equals the provider's category AND the job's district equals the
provider's district**, excluding the provider's own postings. The board is only
shown to users who actually have a provider profile (role alone is not enough).
Each board card is flagged `responded` if the provider already replied.

### Responding

`JobRespondForm` → `POST /api/jobs/{jobId}/responses` (message 10–1000 chars).
Only registered providers may respond, and the server **re-enforces the scoping
rule**: responding to your own job (400), or to a job outside your category or
district (403 "This job is outside your category or district"), or to a job that
is not OPEN (400) all fail. One response per provider per job. The customer gets
a best-effort email.

### Managing your jobs

The same page shows a customer their own jobs (`GET /api/jobs/mine`) with the
response list and a status toggle. **Job statuses are OPEN / CLOSED**; the owner
closes/reopens via `PATCH /api/jobs/{jobId}` `{ status }`.

Admins have read-only oversight of all jobs — see
[ADMIN.md](../admin/jobs.md). **Monetization — payments, commission/fees, billing
and transaction records — is intentionally deferred to v0.2**; the platform is
free to use in v0.1. Service rates, the price-range filter, and the optional job
budget are **informational only** (displayed to help matching); no money changes
hands through the platform and there is no checkout, ledger, or commission.

---

