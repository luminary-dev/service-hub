# Saved searches & new-match alerts


Signed-in **customers** can save a `/providers` search and get notified
(in-app + email) when a newly joined professional matches it (#516).
Complements
[favorites](favorites.md): a favorite pins a specific provider, a saved search
pins a *need* ("electrician in Matara") before the right provider exists.

## Saving a search

The providers browse page shows a **"Save this search"** affordance
(`SaveSearchButton`) whenever a customer has at least one primary filter
active — free-text `q`, `category` or `district`. It expands into a one-field
name form (prefilled with a label derived from the filters) and POSTs
`/api/saved-searches`. Only those three filters are persisted; advanced
filters (price, rating, availability, sort) are not part of a saved search.

Saved searches live in **identity-service** (`SavedSearch`: `userId`, `name`,
`query`/`category`/`district`, `locale`, `lastNotifiedAt`), next to favorites.
Rules enforced there:

- Customer-only — every route 403s for other roles.
- At least one filter required (an empty search would match everyone).
- Category is validated against the S2S category cache, district against the
  fixed district list.
- Re-saving identical filters returns the existing row instead of a duplicate.
- Cap of **20 per user** (429 beyond it).
- The UI locale at save time is stored so the alert email speaks the right
  language.

The `/account` page lists a customer's saved searches (`SavedSearches`
component) with a "view results" link that re-runs the search and an
optimistic delete (`DELETE /api/saved-searches/:id`).

## New-match alerting

When a provider profile is **newly published** (registration or a first-time
customer→provider upgrade — i.e. a fresh `POST /internal/providers` create;
the idempotent duplicate path and profile *re-activation* do not re-alert),
provider-service fans out, after responding and entirely best-effort:

1. `GET identity /internal/saved-searches/candidates?category=&districts=a,b&excludeUserId=`
   — the saved searches this provider could match. `districts` is the
   provider's **full served set** (#502 multi-district: primary +
   `serviceDistricts`), so a saved search for any served district qualifies —
   not just where the provider is based. Identity applies the rest of the
   scoping there: a search's null category/district means "any"; only current
   CUSTOMER accounts with a **verified email**; ≥24 h since the search's
   `lastNotifiedAt` (one alert per search per day); the new provider's own
   user excluded; capped at 500.
2. Each distinct free-text `query` is evaluated with the same
   `buildBrowseWhere` clause the public browse uses, pinned to the new row
   (`findFirst` on `id` + the search where-clause, including category-label
   resolution) — so a saved search matches exactly when the new provider
   would appear in its results. Bounded at 50 distinct queries per create.
3. Matched owners are deduped by user, capped at 200 recipients, and handed to
   `POST notification /internal/notifications/events` as one batched
   `SAVED_SEARCH_MATCH` event (each recipient carries the locale their search
   was saved under). notification-service acks 202, writes the in-app feed
   rows inline and queues the EN/SI "new match" emails behind per-user
   notification preferences, linking to the new provider's profile. The
   notification names the provider's primary (base) district — the same one
   their card shows — even when the search matched a secondary served
   district.
4. `POST identity /internal/saved-searches/notified` stamps `lastNotifiedAt`
   on the searches whose owners actually made the batch.

Known limits (v0.1, by design): alerts fire only on new-profile publish (not
on profile edits, reactivation, or un-suspension); the free-text match
inspects the profile as registered — the check runs against the row committed
at publish, so Sinhala headline/bio variants (or anything else) added later
via a profile edit are never re-matched; a failure anywhere is logged and
dropped rather than retried.

---
