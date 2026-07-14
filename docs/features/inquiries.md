# Inquiries & messaging


### Sending an inquiry

The provider profile's `InquiryForm` collects name, phone, optional email, and
a message (10–2000 chars) and submits
`POST /api/providers/{providerId}/inquiries`. The provider gets a best-effort
`NEW_INQUIRY` notification (in-app + email via notification-service's events
endpoint) linking to the new thread. Inquiries are rate-limited (see
[RATE_LIMITING.md](../RATE_LIMITING.md)).

A **signed-in** sender must have a **verified email** (#115): provider-service
checks identity-service over S2S and returns **403** (`Verify your email address
to contact a provider`) otherwise — an unverified inquiry also permanently
satisfies the review interaction gate, so it must be closed off. **Anonymous**
inquiries (no session) are deliberately still allowed and are not gated, mirroring
how job posting gates only authenticated callers. On the web the `InquiryForm`
surfaces this proactively for a signed-in-but-unverified viewer: it shows the
`EmailVerifyBanner` (with a resend action) and disables submit rather than
letting the request bounce off the backend 403. A genuine identity outage fails
loudly as **502**.

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
- sends with `POST /api/inquiries/{id}/messages` (body up to 2000 chars); the
  other party gets a best-effort `THREAD_REPLY` notification (#393 — in-app +
  email, linking to their side of the thread; anonymous inquiries have no
  customer account, so a provider reply to one notifies nobody);
- each counterpart message carries a **Report** action
  (`POST /api/messages/{id}/report`, #376, thread parties only) feeding the
  [admin reports queue](../admin/moderation.md#reports-queue); a message an
  admin takes down disappears from the thread for both parties.

Provider-side inquiry statuses are **NEW / RESPONDED / CLOSED**, with
mark-responded / close / reopen actions
(`PATCH /api/provider/inquiries/{id}`).

The provider inbox is paginated (#372): the dashboard embeds the first 20
inquiries (plus `inquiriesTotal` / `newInquiriesCount`), and the Inquiries tab
loads deeper pages on demand from `GET /api/provider/inquiries?page=&pageSize=`
(default 20, cap 100).

---

