# In-app notifications

Signed-in users get an in-app notification center (#394, RFC
[stateful notification service](../rfcs/stateful-notification-service.md)): a
navbar bell with an unread badge, a full feed at `/account/notifications`, and
per-type delivery preferences on `/account`. The web app is a pure consumer of
notification-service's public routes (see the endpoint table in
[api/public.md](../api/public.md)); events are written by the backend emitters
as marketplace activity happens.

## The bell (`NotificationBell`)

The navbar shows a bell for every signed-in user (any role), next to the user
menu so it stays reachable on mobile:

- **Badge** — `GET /api/notifications/unread-count`, fetched on mount,
  refreshed when the tab regains focus, and slow-polled every 60 s while the
  tab is visible. No websockets/SSE in v0.1 — the loop is refetch. The count
  is announced to screen readers via a `role="status"` region and carried in
  the trigger's accessible name; the visual badge caps at `99+`.
- **Degrade to hidden** — until the count endpoint has answered once the bell
  doesn't render at all (same fail-soft posture as `FavoriteButton`); a
  notification-service outage never breaks the navbar.
- **Dropdown** — opening fetches the latest 10 (`GET /api/notifications?take=10`)
  and immediately marks the unread ones read (`POST /api/notifications/read`
  with their ids); the rows keep their unread dot for that open so the user
  still sees what was new, and the badge drops once the write is confirmed.
  Escape closes and returns focus to the trigger (the `UserMenu` pattern). A
  "view all" link leads to the feed page.

## The feed (`/account/notifications`)

A session-gated server page fetches the first page (20 rows) via the gateway;
the `NotificationsFeed` client component renders it and pages older rows
through the API's cursor ("Show older" — a cursor feed has no page count for
the shared `Pagination` primitive). Unread rows are tinted and carry a
screen-reader "Unread" marker; following a row's link marks it read
(optimistic, fire-and-forget), and **Mark all as read** clears the backlog via
`{ all: true }`.

### Rendering: data, not prose

Notification rows store `type` + a small JSON `payload` (names, titles,
ratings), never a finished sentence. The web renders the sentence at read
time from the EN/SI render maps in `src/lib/i18n.ts`
(`dict.<locale>.notifications.render`, one entry per catalog type, exercised
through `notificationText()` in `src/lib/notifications.ts`), so switching
language re-renders the entire feed — including old rows — in the new locale.
District names in payloads are localized with `districtLabelLoc`. Unknown
types (a feed read by an older build mid-rollout) and malformed payloads
degrade to a generic "You have a new notification." line.

## Preferences (`/account`)

The account portal has a **Notification preferences** section rendering the
`GET /api/notification-preferences` matrix — one row per catalog type with
independent **Email** and **In-app** checkboxes. The API merges defaults
(both channels on) over the user's stored sparse overrides, so the UI never
has to know the catalog; each toggle upserts a single override via
`POST /api/notification-preferences` (optimistic, reverted with a toast on
failure — the `SavedSearches` pattern).

The transactional auth/security emails (verify, password reset, change-email,
…) are **not** catalog types: they never appear here and cannot be muted.

## Event catalog

Ten types, mirrored in `src/lib/notifications.ts` (`NOTIFICATION_TYPES`) with
localized labels and sentences:

| Type | Recipient | Example (EN) |
|---|---|---|
| `NEW_INQUIRY` | provider | "Kasun sent you a new inquiry." |
| `THREAD_REPLY` | other thread party | "Kasun replied in your inquiry conversation." |
| `NEW_REVIEW` | provider | "Kasun left a 5-star review on your profile." |
| `REVIEW_RESPONSE` | review author | "Sunil replied to your review." |
| `VERIFICATION_APPROVED` | provider | "Your provider verification was approved." |
| `VERIFICATION_REJECTED` | provider | "Your provider verification was rejected: …" |
| `NEW_JOB_MATCH` | matched providers | "New job matching your trade in Matara: “…”." |
| `JOB_RESPONSE` | job's customer | "Sunil responded to your job “…”." |
| `SAVED_SEARCH_MATCH` | saved-search owner | "New match for a saved search: Sunil in Colombo." |
| `REPORT_RESOLVED` | reporter | "Your report was reviewed and resolved." |

Which backend call sites emit each event (and the email half of the fan-out)
is documented in the RFC's event-catalog table; the emitters land in the
follow-up backend PR (#393).
