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

**On a successful post, matching providers are notified (#501/#394).** After
the job is saved, job-service fans out a best-effort `NEW_JOB_MATCH`
notification to every provider whose **category matches the job and whose
service area contains the job's district** (`Provider.serviceDistricts`, #502
— the same scoping the board applies, suspended profiles excluded, the poster
excluded). It asks provider-service for the matching providers
(`GET /internal/providers/matching`, userId + contact email, capped at 200 and
deduped) and hands the whole list to notification-service in one batched call
(`POST /internal/notifications/events`), which **acks immediately (202)**,
writes the in-app feed rows inline and queues the EN/SI "new matching job"
emails behind per-user notification preferences (#557), so the customer's post
never waits on up to 200 sends. The fan-out is wrapped so a provider-lookup or
notification failure is logged and **never fails the post** — this is the
forward direction of the response-notification below.

### The provider job board — response scoping

**`/jobs`** shows a provider their matching board via `GET /api/jobs/board`.
**Scoping rule:** the board returns only **OPEN** jobs where the job's
**category equals the provider's category AND the job's district is one of the
provider's served districts** (`serviceDistricts`, #502 — falls back to the
home district for a payload predating the field), excluding the provider's own
postings. The board is only
shown to users who actually have a provider profile (role alone is not enough),
and a **suspended** profile is 403'd (#642): it keeps its PROVIDER role but
loses board access, mirroring how a hidden profile is dropped from every public
listing.
Each board card is flagged `responded` if the provider already replied, and
carries a **Report** action (`POST /api/jobs/{jobId}/report`, #376 — reports
are accepted with or without a session; a signed-in re-report refreshes the
existing open one) feeding the
[admin reports queue](../admin/moderation.md#reports-queue); a full admin can
take a reported job down (`PATCH /api/admin/jobs/:id` `{ action: "hide" }` —
it leaves the board and stops accepting responses; SUPPORT can work the queue
but not hide — see [admin jobs](../admin/jobs.md)).

### Responding

`JobRespondForm` → `POST /api/jobs/{jobId}/responses` (message 10–1000 chars).
Only registered providers may respond (a suspended profile is 403'd, #642), and
the server **re-enforces the scoping rule**: responding to your own job (400),
or to a job outside your category or served districts (403 "This job is outside
your category or district"), or to a job that is not OPEN (400) all fail. One response per provider per job. The customer
gets a best-effort `JOB_RESPONSE` notification (in-app + email, via the same
events endpoint).

Job titles/descriptions and response messages also pass the write-time
[content filter](../admin/moderation.md#content-filter-write-time-auto-reports)
(#375): a denylist hit never blocks the post — it auto-files a `SYSTEM`-sourced
`JOB` / `JOB_RESPONSE` report into the admin moderation queue
(`GET /api/admin/job-reports`).

### Managing your jobs

The same page shows a customer their own jobs (`GET /api/jobs/mine`) with the
response list and a status toggle. A **suspended** responder's contact details
are withheld here (name → `Unknown`, phone → `null`, #642), matching the public
listings it's already dropped from. **Job statuses are OPEN / CLOSED**; the owner
closes/reopens via `PATCH /api/jobs/{jobId}` `{ status }`.

Admins have oversight of all jobs, plus the hide/unhide takedown — see
[ADMIN.md](../admin/jobs.md). **Monetization — payments, commission/fees, billing
and transaction records — is intentionally deferred to v0.2**; the platform is
free to use in v0.1. Service rates, the price-range filter, and the optional job
budget are **informational only** (displayed to help matching); no money changes
hands through the platform and there is no checkout, ledger, or commission.

---

