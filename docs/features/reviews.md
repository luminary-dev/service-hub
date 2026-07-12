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
  and comment (1–5 stars, comment 3–1000 chars) and appends photos.
- **Review photos** — up to **3** per review (JPEG/PNG/WebP), submitted
  multipart to `POST /api/providers/{providerId}/reviews`. Authors can remove
  their own photos (`DELETE /api/reviews/photos/{id}`, a hard delete).
- Each review can be reported (`POST /api/reviews/{id}/report`). Admins moderate
  reviews from the [reports queue](../admin/moderation.md#reports-queue) and provider detail
  view (soft delete + restore).

Review creation and responses are rate-limited (see
[RATE_LIMITING.md](../RATE_LIMITING.md)).

---

