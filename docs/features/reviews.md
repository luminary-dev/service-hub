# Reviews


Reviews live in the profile's Reviews section (`ReviewSection`), backed by
review-service.

- **Who can review.** A signed-in, non-owner user can submit a review **only
  after a real interaction** — having previously sent that provider an inquiry
  through the platform. Anonymous visitors see a "sign in to review" prompt.
- **Interaction-gated (#25).** Review creation is hard-gated server-side on the
  reviewer having a prior inquiry with the provider (checked via an internal
  `inquiries/exists` call to provider-service). No interaction ⇒ the create is
  rejected with **403** ("You can only review a provider you've contacted. Send
  them an inquiry first."). Because this is a write-path gate it *fails loudly*:
  if the interaction check is unavailable the request returns **502** rather
  than silently allowing an unverified review. Every review that passes the
  gate is therefore stamped **Verified**.
- **One review per (provider, customer)** — re-submitting replaces the rating
  and comment (1–5 stars, comment 3–1000 chars) and appends photos. The
  provider owner gets a best-effort `NEW_REVIEW` notification (#393 — in-app +
  email via notification-service's events endpoint).
- **Optional per-dimension sub-ratings (#528).** Alongside the mandatory
  overall star, a reviewer can *optionally* score four aspects — **quality**,
  **punctuality**, **value** and **communication** — each 1–5. They are
  nullable and additive: the overall `rating` stays **authoritative** for
  ranking/sorting (dimensions never affect it), and a review with no dimensions
  behaves exactly as before. Omitting a dimension on an edit leaves its stored
  value untouched.
- **Rating breakdown + distribution.** The profile's Reviews section shows,
  over *all* of the provider's non-deleted reviews, the per-dimension averages
  (each over its non-null values) and a 5→1 star-count histogram, next to the
  overall average and count. The web reads these directly from review-service's
  public reviews endpoint (`summary` field) — see
  [API reference](../api/public.md).
- **Review photos** — up to **3** per review (JPEG/PNG/WebP), submitted
  multipart to `POST /api/providers/{providerId}/reviews`. Authors can remove
  their own photos (`DELETE /api/reviews/photos/{id}`, a hard delete; admins
  can remove any).
- **Provider responses (#395).** The reviewed profile's owner can keep **one
  public reply per review** — add, edit (posting again replaces the text,
  3–1000 chars) or delete it, via `POST`/`DELETE
  /api/reviews/{id}/response`. Ownership is verified server-side over S2S
  (fail-loud on the write path); suspended providers cannot respond. The reply
  renders under the review for every visitor as written (a single free-text
  field — only the surrounding UI chrome is localized), and hides with the
  review when it is soft-deleted (and cascades on hard delete). A **first**
  response sends the review's author a best-effort `REVIEW_RESPONSE`
  notification (edits stay silent).
- Each review can be reported (`POST /api/reviews/{id}/report`). Admins moderate
  reviews from the [reports queue](../admin/moderation.md#reports-queue) and provider detail
  view (soft delete + restore).
- Every submitted comment also passes the write-time
  [content filter](../admin/moderation.md#content-filter-write-time-auto-reports)
  (#375): a denylist hit never blocks the write — it auto-files a
  `SYSTEM`-sourced report so the review surfaces in the moderation queue.

Review creation and responses are rate-limited (see
[RATE_LIMITING.md](../RATE_LIMITING.md)).

---

