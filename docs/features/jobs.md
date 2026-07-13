# Jobs (reverse-marketplace)


Instead of only browsing providers, a customer can post a job and let scoped
providers come to them. Frontend under `src/app/jobs/**`; backend in
job-service. All jobs pages require a session.

### Posting a job

**`/jobs/new`** (`JobPostForm`) → `POST /api/jobs`: category (validated against
the live category list), district (one of the 25), title (5–100), description
(10–2000), optional budget (Rs. 100–100,000,000). Posting is rate-limited
per IP, and (#556) **requires a verified email** (job-service checks
identity-service S2S; unverified → 403) with a **per-account cap of 10 posts
per rolling 24h** (429 beyond that) — both gates run before the job is saved,
so a blocked post never triggers the provider fan-out.

**On a successful post, matching providers are emailed (#501).** After the job
is saved, job-service fans out a best-effort notification to every provider
whose **category and district match the job** (the same scoping the board
applies, suspended profiles excluded, the poster excluded). It asks
provider-service for the matching contact emails
(`GET /internal/providers/matching`, capped at 200 and deduped) and hands the
whole list to notification-service in one batched call
(`POST /internal/email/new-job`, EN/SI "new matching job" template).
notification-service **acks the batch immediately (202) and sends in the
background** (#557), so the customer's post never waits on up to 200 sends. The
fan-out is wrapped so a provider-lookup or email failure is logged and **never
fails the post** — this is the forward direction of the response-notification
below.

### The provider job board — response scoping

**`/jobs`** shows a provider their matching board via `GET /api/jobs/board`.
**Scoping rule:** the board returns only **OPEN** jobs where the job's
**category equals the provider's category AND the job's district equals the
provider's district**, excluding the provider's own postings. The board is only
shown to users who actually have a provider profile (role alone is not enough).
Each board card is flagged `responded` if the provider already replied, and
carries a **Report** action (`POST /api/jobs/{jobId}/report`, #376) feeding the
[admin reports queue](../admin/moderation.md#reports-queue); an admin can take
a reported job down (it leaves the board and stops accepting responses — see
[admin jobs](../admin/jobs.md)).

### Responding

`JobRespondForm` → `POST /api/jobs/{jobId}/responses` (message 10–1000 chars).
Only registered providers may respond, and the server **re-enforces the scoping
rule**: responding to your own job (400), or to a job outside your category or
district (403 "This job is outside your category or district"), or to a job that
is not OPEN (400) all fail. One response per provider per job. The customer gets
a best-effort email.

Job titles/descriptions and response messages also pass the write-time
[content filter](../admin/moderation.md#content-filter-write-time-auto-reports)
(#375): a denylist hit never blocks the post — it auto-files a `SYSTEM`-sourced
`JOB` / `JOB_RESPONSE` report into the admin moderation queue
(`GET /api/admin/job-reports`).

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

