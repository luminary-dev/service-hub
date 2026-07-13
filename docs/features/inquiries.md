# Inquiries & messaging


### Sending an inquiry

The provider profile's `InquiryForm` collects name, phone, optional email, and
a message (10–2000 chars) and submits
`POST /api/providers/{providerId}/inquiries`. The provider gets a best-effort
email notification. Inquiries are rate-limited (see
[RATE_LIMITING.md](../RATE_LIMITING.md)).

Inquiry text and every thread message also pass the write-time
[content filter](../admin/moderation.md#content-filter-write-time-auto-reports)
(#375): a denylist hit never blocks delivery — it auto-files a `SYSTEM`-sourced
`INQUIRY` report (with the offending excerpt in its details) so the thread
surfaces in the admin moderation queue.

### Message threads

An inquiry opens a two-party thread, viewable by both sides:

- Provider side — dashboard Inquiries tab → `/dashboard/inquiries/[id]`.
- Customer side — `/account` → `/account/inquiries/[id]`.

Both render `MessageThread`, which:

- loads the full thread from `GET /api/inquiries/{id}/messages` on mount;
- **polls every 5 s** (`POLL_MS = 5000`) using `?after={lastSeen}` and dedupes
  by message id (no websockets);
- sends with `POST /api/inquiries/{id}/messages` (body up to 2000 chars).

Provider-side inquiry statuses are **NEW / RESPONDED / CLOSED**, with
mark-responded / close / reopen actions
(`PATCH /api/provider/inquiries/{id}`).

---

