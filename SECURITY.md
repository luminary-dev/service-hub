# Security Policy

Baas.lk is a public repository, but the application it powers handles sensitive
data: user accounts, passwords and JWT sessions, password-reset flows, and
identity-verification documents (NIC / business documents uploaded by
professionals). We take vulnerability reports seriously and appreciate
responsible disclosure.

This document has two parts:

1. **[Vulnerability disclosure](#vulnerability-disclosure)** — how to report an
   issue and what to expect.
2. **[Security model](#security-model)** — a reference-grade overview of how the
   platform authenticates users, revokes sessions, trusts internal traffic, and
   hardens its edges. For the authorization / RBAC model (admin tiers, gating,
   audit, impersonation) see [`docs/AUTHZ.md`](docs/AUTHZ.md).

---

## Vulnerability disclosure

### Supported versions

The project is pre-1.0. Only the latest `0.1.x` release line receives security
fixes; older tags do not.

| Version | Supported |
| --- | --- |
| `0.1.x` | ✅ |
| < `0.1.0` | ❌ |

### Reporting a vulnerability

Please report suspected vulnerabilities **privately**:

- Email **security@baas.lk**.
  > ⚠️ **Placeholder** — this address needs to be confirmed / provisioned
  > before launch. If it bounces, open a private
  > [GitHub Security Advisory](https://github.com/luminary-dev/service-hub/security/advisories/new)
  > instead.
- Alternatively, use GitHub's **"Report a vulnerability"** button on the
  Security tab to open a private advisory.

Include enough detail to reproduce: affected endpoint or component, steps,
impact, and any proof-of-concept. If the issue touches auth, sessions, or the
handling of verification documents, please say so — we triage those first.

### What NOT to do

- **Do not open a public GitHub issue** for a security vulnerability — public
  issues are for non-sensitive bugs and feature requests only.
- Do not disclose the issue publicly (blog, social media, conference) until we
  have shipped a fix and agreed on a disclosure timeline.
- Do not access, modify, or exfiltrate other users' data, and do not run
  automated scans against production infrastructure.

### What to expect

- **Acknowledgement within 72 hours** of your report.
- An initial assessment and severity triage shortly after.
- Regular updates on remediation progress, and credit in the release notes /
  advisory once the fix ships (unless you prefer to remain anonymous).

Thank you for helping keep Baas.lk and its users safe.

---

## Security model

Baas.lk is a Next.js web app in front of an API gateway that reverse-proxies a
set of internal microservices (identity, provider, job, review, chat, media,
notification). The gateway is the **only** public API entry point; individual
services are never exposed. This section documents the controls that hold that
boundary. File references are canonical — read the code if this doc and the code
ever disagree, and fix the doc.

### Session authentication

- **Token.** A session is a JWT (`sh_session` cookie) signed **HS256** with the
  shared `AUTH_SECRET`. **identity-service is the only signer**
  (`services/identity-service/src/lib/session.ts` — `signSession`); the gateway
  (`services/api-gateway/src/lib/session.ts`) and the web app
  (`src/lib/auth.ts`) only ever **verify** it.
- **Algorithm pinning.** Every verifier calls `jwtVerify(..., { algorithms:
  ["HS256"] })`, pinning the algorithm to block `alg: none` / algorithm-
  confusion attacks.
- **Claims.** `userId`, `role`, `name`, `sv` (session version — see revocation
  below), and an optional `avatar` (profile-photo URL, so the top-nav renders it
  without a `/me` fetch; #434). Expiry is **7 days** (`setExpirationTime("7d")`).
- **Cookie flags.** `HttpOnly`, `SameSite=Lax`, `Secure` in production
  (`NODE_ENV=production`), `Path=/`, `Max-Age` 7 days. HttpOnly keeps the token
  out of JS; SameSite=Lax is the first line of CSRF defence.
- **Secret guard.** `AUTH_SECRET` (and `INTERNAL_API_SECRET`) **must** be set in
  production — the code throws on boot rather than silently falling back to the
  public dev constant.
- **Gateway behaviour.** On each request the gateway verifies the cookie and,
  only on success, stamps identity headers (`x-user-id`, `x-user-role`,
  `x-user-name`) onto the upstream request. An invalid/absent token is forwarded
  **without** identity headers — the gateway never returns the 401 itself; each
  service decides its own 401/403.

### Session revocation (`sessionVersion`)

Because JWTs are stateless, logout and credential changes need an explicit
revocation channel. Every user row carries a monotonic `sessionVersion`; the
token embeds the value it was minted with as the `sv` claim.

- **Bumps.** identity-service increments `sessionVersion` on **password change**,
  **password reset**, and **logout-everywhere** (`POST /api/auth/logout-all`),
  plus admin **force-logout** (`services/identity-service/src/routes/auth.ts`,
  `admin-users.ts`). Each bump re-mints the caller's own cookie so the acting
  user stays signed in while every other token becomes stale.
- **Enforcement.** Both the gateway
  (`services/api-gateway/src/lib/session-version.ts`) **and** the web app
  (`src/lib/session-version.ts`) check `sv` against identity's current version,
  so UI page-gating and data access agree. A token whose `sv` is behind the
  current version is rejected.
- **Cached + fail-open.** The check is cached per user for a 60s TTL (one S2S
  call per user per window; revocation takes effect within the TTL at worst). If
  identity-service is unreachable the check **fails open** — an identity outage
  must not sign every user out. A token carrying a *newer* `sv` than the cache
  is trusted and adopted (keeps a user signed in immediately after a
  password change mints their `v+1` cookie while the old `v` is still cached).
- **Deleted users.** If identity reports the user no longer exists, the token is
  treated as dead (fail closed for that case).

### Service-to-service (S2S) trust

- **Internal secret.** Every inter-service request (gateway→service and
  service→service) carries `x-internal-secret`. Each service applies
  `requireInternalSecret` globally except `/healthz`
  (`services/*/src/lib/http.ts`), returning 403 without it. Services are never
  reachable from the public internet — only the gateway is.
- **Constant-time comparison.** The secret is compared with
  `crypto.timingSafeEqual` (after a length check) rather than `!==`, so response
  timing cannot leak the secret's length or prefix.
- **Identity headers are gateway-owned.** Before proxying, the gateway **strips**
  any client-supplied `x-user-*`, `x-impersonated-by`, `x-internal-secret`,
  `x-origin`, `x-request-id`, etc. (`GATEWAY_HEADERS` in
  `services/api-gateway/src/lib/proxy.ts`) and sets its own only after JWT
  verification. A client therefore cannot forge an identity — the internal
  secret is what makes the forwarded `x-user-role` authoritative to downstream
  services.
- **Email-link origin.** A configured `WEB_ORIGIN` is authoritative for absolute
  links in password-reset / verification emails; client-supplied
  `x-forwarded-host` is only trusted in dev when `WEB_ORIGIN` is unset — this
  closes a host-header-poisoning account-takeover vector.

### Password policy

- **Strength** (`services/identity-service/src/lib/register-schema.ts`):
  minimum **10 characters** (length is the strongest single factor), max 100,
  plus an offline **common/breached-password screen**
  (`common-passwords.ts`, case-insensitive deny-list of credential-stuffing
  staples). The same `passwordSchema` is reused by registration, change-password
  and reset-password, so a reset can't set a password registration would reject.
- **Hashing.** `bcrypt` (cost 10). Raw passwords are never stored.
- **Social-login accounts (#398).** Users who sign up with Google have **no
  password** (`User.passwordHash` is nullable). Password login still returns the
  uniform 401 for them, change-password redirects to the reset flow, and
  delete-account skips the password re-auth (the session is the proof). OAuth
  uses `arctic` inside identity-service with PKCE + a state cookie; an existing
  account is auto-linked only on a Google-**verified** email that matches. See
  [docs/AUTHZ.md](docs/AUTHZ.md#sign-in-methods-398).
- **Per-account lockout** (`lib/lockout.ts`): 5 failed logins locks the account
  for 15 minutes; the counter resets only on a successful login. Admins can
  apply a manual (effectively indefinite) lock reusing the same `lockedUntil`
  column. This complements the gateway's per-IP throttle — a distributed
  attack that rotates IPs still trips the per-account limit.
- **Enumeration resistance.** Login runs a bcrypt compare even for unknown
  emails and locked accounts (constant work), and returns the same
  `Invalid email or password` 401 for wrong-password, unknown-email and
  locked-out cases. `forgot-password` always returns the same response
  regardless of whether the email exists, and sends the email fire-and-forget so
  timing doesn't leak existence.
- **Reset / verification tokens** (`lib/tokens.ts`): 32 random bytes; only the
  **SHA-256 hash** is stored, so a DB leak can't be replayed to reset accounts.
  Reset tokens are single-use (all of a user's tokens are consumed on use) with
  a 1-hour TTL; email-verification tokens have a 24-hour TTL.

### Transport & response headers

- **HSTS.** Set at the Caddy edge (`deploy/Caddyfile`) and again by Next in
  production (`next.config.ts`): `max-age=63072000; includeSubDomains; preload`.
  Emitting it in both places keeps it correct if the app is ever fronted by a
  different proxy. Caddy also auto-provisions TLS (Let's Encrypt) and redirects
  HTTP→HTTPS. Dev is plain HTTP and omits HSTS.
- **CSP.** **Enforced** (promoted from Report-Only, #112) in `next.config.ts`.
  Everything is `'self'` except: `script-src` allows `'unsafe-inline'` (Next
  injects inline runtime/hydration scripts without a nonce when self-hosted) and
  `'unsafe-eval'` **in dev only** (Turbopack/React HMR); `style-src` allows
  `'unsafe-inline'` (Tailwind, next/font, inline style attrs); `img-src` adds
  `data:`/`blob:` for upload previews. `frame-ancestors 'none'`, `base-uri
  'self'`, `form-action 'self'`, `object-src 'none'`.
- **Other headers.** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy`
  that disables camera/microphone/geolocation/browsing-topics.

### Edge hardening (gateway)

Middleware order in `services/api-gateway/src/app.ts`: request-id → CSRF →
rate-limit → body-limit → proxy.

- **CSRF** (`lib/csrf.ts`): defence-in-depth on top of SameSite=Lax. Safe
  methods (GET/HEAD/OPTIONS) always pass. For state-changing methods the gateway
  trusts the browser-set `Sec-Fetch-Site` header (a cross-site attacker page
  can't forge it); when absent (non-browser clients, which carry no ambient
  cookies) it falls back to comparing the `Origin` host against the request host.
  Cross-site state changes get 403.
- **Rate limiting** (`lib/rate-limit.ts`): per-IP sliding window over the
  abuse-prone POST endpoints (login/forgot/reset/change-password/delete-account
  on the strict 8/15min budget, register, resend, inquiries, reviews, messages,
  reports), returning 429 with `Retry-After`. **Redis-backed** when `REDIS_URL`
  is set (shared across instances, survives restarts); otherwise an in-memory
  per-instance fallback. Redis failures fall back to in-memory rather than
  erroring. Full table in [`docs/RATE_LIMITING.md`](docs/RATE_LIMITING.md).
- **Request-size caps.** The gateway buffers request bodies before forwarding,
  so it caps them at **6MB** (`bodyLimit`, covering the 5MB image limit plus
  multipart overhead) and returns 413 before buffering. It also imposes a 30s
  upstream timeout so a single hung service can't pin every route.
- **Chat endpoint** (`src/app/agent/chat/route.ts` → chat-service): the
  assistant drives a paid Claude tool loop, so it is deliberately not public.
  The web proxy **requires a valid session** (401 otherwise), enforces a
  **per-user rate limit** (15 req/min sliding window), and caps the body at
  **256KB** (413 otherwise). chat-service repeats the body cap as defence in
  depth and bounds history to 40 turns / 6 tool-use loops
  (`services/chat-service/src/routes/chat.ts`). The `ANTHROPIC_API_KEY` lives
  only in chat-service, never in the web runtime.

### Uploads

- **Processing** (`services/media-service/src/lib/media.ts`): every uploaded
  image is decoded and **re-encoded with sharp**. This proves the payload really
  is an image in its claimed family (a polyglot/mislabeled file fails to decode)
  and **strips all metadata** — EXIF GPS coordinates in a tradesperson's phone
  photo would otherwise leak their home location. EXIF orientation is baked in
  via `rotate()` before metadata is dropped.
- **Constraints.** Max **5MB**; allowed types **JPEG / PNG / WebP** only; output
  is always one of those three. Path prefixes are validated against a strict
  slug regex and file serving refuses path traversal / unknown namespaces.
- **Storage.** A **private Cloudflare R2** bucket (or local disk in dev); objects
  are streamed back through the internal `/api/files/...` route, so no public
  bucket or domain is exposed. Orphaned files (unreferenced past a 24h grace
  window) are swept.

### Authorization

Role-based access control — the CUSTOMER/PROVIDER/ADMIN/SUPPORT model, how
`/admin` is gated, the admin capability matrix, audit logging, and
impersonation — is documented separately in [`docs/AUTHZ.md`](docs/AUTHZ.md).

### Known follow-ups

- **#201 — X-Forwarded-For trust.** The gateway derives the client IP for rate
  limiting from the first `x-forwarded-for` entry (`clientIp` in
  `lib/rate-limit.ts`). Behind an untrusted hop this is spoofable; the trusted
  proxy chain / hop count needs to be pinned so the limiter keys on a real
  address.
- **#112 — CSP nonce.** CSP is enforced but `script-src` still allows
  `'unsafe-inline'` because self-hosted Next emits nonce-less inline scripts.
  Migrating to a per-request nonce + `'strict-dynamic'` is the follow-up
  hardening that removes `'unsafe-inline'`.
