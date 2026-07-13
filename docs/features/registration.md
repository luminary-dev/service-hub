# Provider registration, profile & verification


### Registration

- **`/register`** — choice screen: register as a provider or as a customer.
- **`/register/customer`** — single-page form (name, email, phone, password).
  Submits `POST /api/auth/register` with `role: "CUSTOMER"`; on success lands on
  `/providers`.
- **`/register/provider`** — a 4-step wizard (`ProviderRegisterForm`) with
  steps **Account → Profile → Contact & Socials → Services & Rates**:
  1. *Account* — name, email, phone, password.
  2. *Profile* — category, headline (5–120 chars), bio (≥20 chars), optional
     Sinhala variants of the headline/bio (#515 — shown to visitors browsing in
     Sinhala, English stays the required source of truth), district (one of the
     25 Sri Lankan districts), city, years of experience (0–60).
  3. *Contact & Socials* (all optional) — WhatsApp, alt phone, Facebook,
     Instagram, TikTok, YouTube, website.
  4. *Services & Rates* — 1–20 service rows, each with title, optional
     description, price, and price type (`HOURLY | DAILY | FIXED | VISIT`).

  Submits `POST /api/auth/register` with `role: "PROVIDER"` and the services
  array; on success lands on `/dashboard?welcome=1`. Registration is free and
  the profile goes live immediately. Signup is rate-limited (see
  [RATE_LIMITING.md](../RATE_LIMITING.md)).

### Legal pages & registration consent (#62)

- **`/terms`** and **`/privacy`** (localized under `/si/*` too) render the
  Terms of Service and the PDPA-aware Privacy Policy from `src/lib/legal.ts`
  via the shared `LegalArticle` component. English is the authoritative text;
  the Sinhala version must mirror its structure (`src/lib/legal.test.ts`).
  Both pages are linked from the footer and listed in the sitemap.
- **Consent.** Both email registration forms require an "I agree to the Terms
  of Service and Privacy Policy" checkbox (`ConsentCheckbox` — native
  `required` on the customer form, wizard validation on the provider form's
  final step), and the social sign-in buttons on `/login` and `/register`
  carry a "by continuing, you agree" notice (`ConsentNotice`).

### Social login (#398)

Both `/login` and `/register` show a **Continue with Google** button
(`GoogleSignInButton`) above the email/password form, when Google is configured
(`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set — otherwise the button is hidden
and password auth is unaffected). The flow, handled by identity-service via
`arctic`:

- `GET /api/auth/oauth/google/start` → redirect to Google (PKCE, state cookie).
- `GET /api/auth/oauth/google/callback` → verifies, resolves the identity, mints
  the same `sh_session` JWT as password login, and redirects into the app.

A first-time Google signup is created as a `CUSTOMER` (then convertible to a
provider via the role-switch flow). An existing account is **auto-linked** only
when the Google email is verified and matches. Failures come back to the form as
`?error=oauth_email` (Google didn't share a verified email),
`?error=oauth_unavailable` (Google not configured / upstream error), or
`?error=oauth` (generic). Authorization semantics — roles, `sessionVersion`
revocation, S2S trust — are identical to password sessions. See
[AUTHZ.md](../AUTHZ.md#sign-in-methods-398). Facebook is a planned fast-follow
(#405) and is **not** shipped yet.

### Post-login return-to (#560)

Sign-in carries the page the user was headed to as a `?next=` param on
`/login`, so a successful sign-in returns them there instead of the generic
role default (`/dashboard` for providers, `/providers` otherwise, which still
applies when there is no `next`):

- **Session-gated pages** (`/jobs`, `/jobs/new`, `/account`,
  `/account/security`, `/dashboard`, and the inquiry threads under both)
  redirect signed-out visitors to `/login?next=<path>` via `loginNext()`
  (`src/lib/login.ts`), preserving the `/si` locale prefix of the URL they
  requested.
- **"Sign in to continue" links** (e.g. the review CTA on a provider profile)
  link to the same URL shape via `loginNextHref()` (`src/lib/links.ts`).
- The login page honors `next` for the password form and threads it to the
  Google/Facebook buttons, whose OAuth flow already round-trips it through the
  identity-service state cookie.

`next` is validated on every consumer (`sanitizeNext` in `src/lib/links.ts` on
the web, its namesake in identity-service `routes/oauth.ts`): only same-origin
relative paths pass — absolute URLs, protocol-relative `//host`, and backslash
variants are dropped, so the param cannot become an open redirect.

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
- **Profile photo** — upload/remove an avatar (`POST`/`DELETE
  /api/account/avatar`, #434; any role, customers included). Stored on the User
  via media-service (`user` namespace, R2 in prod), denormalized to the provider
  profile when one exists, and carried in the re-issued session so the top-nav
  avatar (`UserMenu`) updates immediately, falling back to initials.
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
- **Photos** — profile-photo (avatar) upload, a **dedicated cover photo**
  (#435, `POST /api/provider/photos` with `kind: "cover"` /
  `DELETE /api/provider/cover`) that is independent of the gallery, plus
  drag-and-drop work-photo uploads with progress, captions, reordering
  (`PATCH /api/provider/photos/order`) and delete. When no dedicated cover is
  set, the first work photo is used as the cover fallback. See
  [Media & uploads](media.md).
- **Inquiries** — the provider's inbox (see [Inquiries](inquiries.md)).

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
them in the [verification queue](../admin/moderation.md#verification-queue).

### Customer account portal

**`/account`** shows a customer's saved professionals, their inquiries, and
their reviews. **`/account/security`** handles change password
(`POST /api/auth/change-password`), sign out everywhere
(`POST /api/auth/logout-all`), and delete account
(`POST /api/auth/delete-account`).

---

