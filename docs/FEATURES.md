# Features guide

Baas.lk is a Sri Lankan services marketplace connecting customers with local
professionals (mechanics, electricians, plumbers, and more). This document
describes the core user-facing flows and how they map onto the code.

Architecture context: the Next.js app is a pure frontend. Client components
call same-origin `/api/*`, which `src/proxy.ts` rewrites to the API gateway;
server components call the gateway directly. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the service map and
[RATE_LIMITING.md](RATE_LIMITING.md) for the per-endpoint limits referenced
below. For admin/moderation flows see [ADMIN.md](ADMIN.md).

---

## Provider registration, profile & verification

### Registration

- **`/register`** — choice screen: register as a provider or as a customer.
- **`/register/customer`** — single-page form (name, email, phone, password).
  Submits `POST /api/auth/register` with `role: "CUSTOMER"`; on success lands on
  `/providers`.
- **`/register/provider`** — a 4-step wizard (`ProviderRegisterForm`) with
  steps **Account → Profile → Contact & Socials → Services & Rates**:
  1. *Account* — name, email, phone, password.
  2. *Profile* — category, headline (5–120 chars), bio (≥20 chars), district
     (one of the 25 Sri Lankan districts), city, years of experience (0–60).
  3. *Contact & Socials* (all optional) — WhatsApp, alt phone, Facebook,
     Instagram, TikTok, YouTube, website.
  4. *Services & Rates* — 1–20 service rows, each with title, optional
     description, price, and price type (`HOURLY | DAILY | FIXED | VISIT`).

  Submits `POST /api/auth/register` with `role: "PROVIDER"` and the services
  array; on success lands on `/dashboard?welcome=1`. Registration is free and
  the profile goes live immediately. Signup is rate-limited (see
  [RATE_LIMITING.md](RATE_LIMITING.md)).

### Account self-service (`/account`)

Customer actions (post a job, send an inquiry, favorite, review) are gated on
an authenticated session, **not** on the `CUSTOMER` role — so a PROVIDER can use
the site as a customer too (#402). The nav/user menu surfaces the post-a-job
entry point for both roles; `/jobs/new`, `/account` and `/providers` never
redirect a provider away (only `/dashboard` and the job board stay
provider-only).

The **Account details** section on `/account` (`AccountDetails`) lets any
signed-in user:

- **Edit name/phone** — `PUT /api/account/profile` (re-issues the session so the
  header/menu name updates without a re-login).
- **Change email** — `POST /api/account/email/change` emails a 1h confirmation
  link **to the new address**; clicking it (`/verify-email-change`) posts
  `POST /api/account/email/confirm`, which switches the address and marks it
  verified. The current session stays valid (email isn't in the JWT).

Role transitions are also surfaced here (and in the user menu):

- **Become a provider** (`CUSTOMER` only) — a CTA routing to the authed provider
  wizard at `/welcome/provider`, which posts `POST /api/auth/complete-provider`
  (creates the profile, flips role → `PROVIDER`, re-issues the session). No
  re-login; lands on `/dashboard`.
- **Close provider profile** (`PROVIDER` only) — a confirm-gated danger action
  (`CloseProviderProfile`) posting `POST /api/auth/leave-provider`. **Suspend/hide,
  not delete**: the `Provider` row is marked `suspended` (dropped from every
  public listing), role reverts to `CUSTOMER`, and the session is re-issued (no
  re-login). Reviews, inquiries and job responses are retained; becoming a
  provider again reactivates the same profile. Audit-logged in identity-service.

### Provider dashboard & profile editing

**`/dashboard`** (`src/app/dashboard/page.tsx`) is the provider's workspace.
It redirects non-providers away and sends providers with no profile to
`/register/provider`. Header stats (rating, reviews, photos, new inquiries) and
a "View public" link to the live profile. A tabbed editor
(`DashboardTabs`) covers:

- **Profile** — `PUT /api/provider/profile`: availability toggle, an
  "away until" date (clears to available), plus all profile/contact/social
  fields.
- **Services** — inline add/edit/delete of service rows.
- **Photos** — avatar upload plus drag-and-drop work-photo uploads with
  progress, captions, reordering (`PATCH /api/provider/photos/order`; the first
  photo is the "Cover"), and delete. See [Media & uploads](#media--uploads).
- **Inquiries** — the provider's inbox (see [Inquiries](#inquiries--messaging)).

### Verification documents

The dashboard's `VerificationSection` drives the verification state machine on
`verificationStatus`:

- `VERIFIED` — verified confirmation.
- `PENDING` — awaiting review.
- `NONE` / `REJECTED` — shows the upload form (rejection reason shown when
  `REJECTED`).

The form takes two optional file inputs — **NIC (front)** and **Business
registration** — accepting JPEG/PNG/WebP up to 5 MB each; at least one is
required. Submits multipart to `POST /api/provider/verification`, moving the
provider to `PENDING`. Documents are private to the review team; admins action
them in the [verification queue](ADMIN.md#verification-queue).

### Customer account portal

**`/account`** shows a customer's saved professionals, their inquiries, and
their reviews. **`/account/security`** handles change password
(`POST /api/auth/change-password`), sign out everywhere
(`POST /api/auth/logout-all`), and delete account
(`POST /api/auth/delete-account`).

---

## Discovery

### Home page (`/`)

**`src/app/page.tsx`** is the landing surface: a hero with the search console
(`SearchBar` + popular-query chips) and, in the right column, an **animated
trade slider** (`HeroSlider`, #447) — a framed technical plate that auto-advances
through trade photos (mechanic, electrician, plumber, welder, carpenter) with a
Ken Burns drift, a brand scan-line wipe, a `Fig.0N` caption, a live counter, an
auto-advance gauge, hover/focus pause, prev/next + tick controls and arrow-key
nav. It honours `prefers-reduced-motion` (static, manually-navigable) and keeps
the first slide `priority` for LCP. Below the hero: the trade registry (category
grid), a trust band, and featured/recent providers.

### Provider directory

**`/providers`** (`src/app/providers/page.tsx`, `PAGE_SIZE = 12`) lists
providers from `GET /api/providers`. Signed-in users also fetch
`GET /api/favorites` so saved cards are marked.

**Filters** (`FilterBar`, all pass through to provider-service):

- Free-text search `q` (matches name and category EN/SI labels).
- `category` and `district` selects (25 districts).
- Price range `priceMin` / `priceMax`.
- Minimum rating `ratingMin` (4+ / 3+ / 2+).
- `availableOnly` toggle.
- **Sort:** recommended (default), highest rated, most reviews, lowest price,
  most experienced, newest.

Category/district/rating/availability/sort apply on change; text and price
apply on submit. Results paginate with prev/next. Ranking over the matched set
is bounded server-side (up to 1000 candidates) and backed by pg_trgm indexes.

Provider cards (`ProviderCard`) show a cover image (uploaded cover → trade stock
photo → placeholder), category, experience, availability chip ("Available" or
"Away until…"), verified tick, location, headline, rating, "from" price, and an
optional favorite button.

### Provider profile

**`/providers/[id]`** (`GET /api/providers/:id/full`) renders the public
profile: hero (avatar, category, verified badge, availability, location,
rating), action chips (favorite, share, report), a stats readout, contact links
(a **tap-to-reveal** phone/WhatsApp button plus socials and website), and four
spec sections — **About,
Services, Photos, Reviews** — with an inquiry form in the sticky sidebar.
Phone numbers are withheld from the public payload and fetched on the reveal tap
via a rate-limited endpoint (#64), so crawlers can't harvest the directory's
numbers from page HTML.
Suspended providers 404 for everyone except admins.

### Open Graph images

**`/providers/[id]/opengraph-image`** generates a 1200×630 PNG via `next/og`
from `GET /api/providers/:id/card`: Baas.lk badge, provider name, English
category label, city/district, and a rating footer. (Satori ships a Latin font
only, so the category label is rendered in English even on `/si`.)

---

## Inquiries & messaging

### Sending an inquiry

The provider profile's `InquiryForm` collects name, phone, optional email, and
a message (10–2000 chars) and submits
`POST /api/providers/{providerId}/inquiries`. The provider gets a best-effort
email notification. Inquiries are rate-limited (see
[RATE_LIMITING.md](RATE_LIMITING.md)).

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

## Jobs reverse-marketplace

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
[ADMIN.md](ADMIN.md#jobs). Monetization (pricing, commission, payments) is
intentionally deferred to v0.2 — the platform is free to use in v0.1.

---

## Reviews

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
  reviews from the [reports queue](ADMIN.md#reports-queue) and provider detail
  view (soft delete + restore).

Review creation and responses are rate-limited (see
[RATE_LIMITING.md](RATE_LIMITING.md)).

---

## Favorites

Signed-in customers can save providers. `FavoriteButton` (overlay on cards,
inline pill on profiles) toggles optimistically and calls
`POST /api/favorites/{providerId}` (add) or `DELETE /api/favorites/{providerId}`
(remove). Favorites are backed by identity-service. The `/account` saved list
fetches `GET /api/favorites`, hydrates the provider cards
(`GET /api/providers?ids=...`) preserving newest-first order, and excludes
suspended profiles.

---

## AI chat assistant

A marketplace concierge that helps customers find a provider and draft an
inquiry, which the customer then sends themselves, in English or Sinhala.

- **Where it runs.** The assistant runs entirely server-side in **chat-service**
  (internal-only), keeping `ANTHROPIC_API_KEY` out of the web runtime. The web
  route `POST /agent/chat` is a thin proxy to
  `POST /internal/chat/marketplace/stream`, streaming Server-Sent Events back to
  the browser and forwarding only the locale. No session cookie is forwarded
  into the LLM-driven service, because nothing there acts on the user's behalf.
- **Model & loop.** Uses Claude (`claude-opus-4-8`) with a server-side tool
  loop: it streams text, and when the model requests a tool it runs it, feeds
  the result back, and continues — up to a safety bound (`MAX_LOOPS = 6`), with a
  message-history cap (`MAX_TURNS = 40`) and a 256 KB request-body cap.
- **Tools the model can call:**
  - `search_providers(category?, district?, q?)` — queries the public directory
    and returns up to 5 matches.
  - `propose_inquiry(providerId, providerName?, name, phone, message)` — does
    **not** write anything. It streams a draft to the browser as an out-of-band
    `proposal` event; the browser renders a confirmation card. The model cannot
    send an inquiry.
- **Out-of-band confirmation (#202).** The real inquiry is created only when the
  **user taps "Confirm & send"** on that card, which fires a normal
  authenticated same-origin `POST /api/providers/:id/inquiries` (the same
  endpoint the plain inquiry form uses, tagged `source: "chat-agent"`) with the
  exact fields the card showed. Confirmation is a user action captured **outside
  the model's control** — a prompt-injected or manipulated model can propose a
  draft but can never send it, since the write path is not a tool it can invoke.
- **Persona & safety.** The system prompt scopes it to Baas.lk, asks for at most
  1–2 things per turn (trade, district, job), suggests up to 3 providers, and
  treats tool-result data as untrusted (it can never send an inquiry — only the
  user's tap on the card does). It won't negotiate prices or bookings, keeps
  replies short, and answers in Sinhala when the locale is `si`.
- **Session-gated & rate-limited.** The web proxy requires a signed-in session
  (401 otherwise) and enforces a per-user sliding window of **15 requests / 60 s**
  (429 on exceed).

---

## Bilingual EN/SI & theme

### Languages

The app is fully bilingual English/Sinhala. All UI strings live in
`src/lib/i18n.ts` (`Locale = "en" | "si"`), with helper localizers for category,
district, and price-type labels.

- **`/si` routing.** `src/proxy.ts` matches `/si` and `/si/*`, rewrites to the
  same path minus the `/si` prefix (keeping a single route tree), and sets an
  `x-locale: si` request header. The browser URL stays `/si/...`.
- **Locale detection.** `getLocale()` returns `si` when the request came through
  `/si`, else falls back to the `lang` cookie, else `en`.
- **Language toggle** — writes the `lang` cookie (1-year) and navigates to the
  localized URL. `generateMetadata` emits hreflang alternates (`en`, `si`,
  `x-default`).
- **Locale-preserving links.** Internal nav, auth, and error-boundary links (and
  their `router.push` redirects) route through `localizedHref(path, locale)`, so
  a visitor under `/si/*` stays in the `/si` URL space as they navigate.

### Theme

Light/dark theme (`src/lib/theme.ts`, `ThemeToggle`), default light. The choice
is stored in a `theme` cookie (1-year) and read server-side so SSR and hydration
agree; toggling flips the `dark` class on `<html>` and refreshes. Charts and
badges derive their colors from CSS variables so they follow the theme.

---

## Media & uploads

All image uploads (provider avatars, work photos, review photos, verification
documents) go through **media-service** (internal-only).

- **Limits.** Max **5 MB** per file; allowed types **JPEG, PNG, WebP** (a
  413/400 otherwise). The web upload UI pre-checks type and size.
- **Re-encoding.** Every image is decoded and re-encoded with `sharp`: EXIF
  orientation is baked in, then **all metadata is stripped** (removing EXIF GPS
  so home locations don't leak). JPEG is re-encoded at quality 85.
- **Storage.** Files are stored in **Cloudflare R2** under
  `{namespace}/{prefix}/{uuid}.{ext}` and served back through the app's
  `/api/files/...` route with a long immutable cache. The bucket stays private —
  bytes are streamed through the service, never from a public bucket URL. A
  local-disk fallback mirrors the same URL shape when R2 is not configured.
- **Cleanup.** Orphaned files (no DB row references them) are removed by a sweep
  with a 24-hour grace period.
