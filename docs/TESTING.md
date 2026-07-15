# Testing

How the project is tested, layer by layer: what exists, how to run it, and
what kind of test belongs where.

## The layers

| Layer | Where | What it covers | Runs in CI |
| --- | --- | --- | --- |
| Service unit tests | `services/*/src/**/*.test.ts` | Each service's routes, validation, auth and business logic (vitest, hundreds of tests across the nine backend services + gateway) | Yes — per-service `npm run test` |
| Gateway app tests | `services/api-gateway/src/app.test.ts` + `src/lib/*.test.ts` | Gateway routing, cookie/CSRF/rate-limit behavior, S2S forwarding — upstream services are stubbed, nothing real is dialed | Yes — part of the gateway suite |
| Web unit tests | `src/lib/*.test.ts`, `src/proxy.test.ts` | Pure logic: locale formatting, i18n dictionary parity, category/district/price-type lookups, sort normalization, the `/api/*` proxy rewrite | Yes — web `npm run test` |
| Web component tests | `src/components/*.test.tsx` | High-value client components (toasts, favorite/share buttons) rendered with Testing Library in jsdom; `fetch`, clipboard and `next/navigation` are mocked | Yes — same web suite |
| Accessibility checks | `src/components/a11y.test.tsx` | axe-core runs against ~12 rendered components (nav, cards, filters, forms, chat, modals) and fails on any serious/critical WCAG violation | Yes — same web suite |
| E2E smoke | `scripts/e2e-smoke.sh` | 60+ checks against the full docker-compose stack: health, auth, favorites, inquiries, reviews, jobs, admin moderation, CSRF, search browse-parity + geo, and authed page-render (SSR-crash) guards | Yes (PRs only) — a dedicated `e2e` job boots the compose stack; also run locally |
| Browser E2E | `e2e/*.spec.ts` (Playwright) | Real Chromium rendering the conversion-critical flows against the running stack: home hero, browse → provider detail, register validation, login, the verified-email gate, and an **admin-authenticated** `/admin/providers` render (the #706 regression guard) + a mobile-viewport spot-check | Yes (PRs only) — a dedicated `playwright` job boots the same compose stack; also run locally |
| Perf / a11y budgets | `.lighthouserc.json` (Lighthouse CI) | Lenient ratchet-floor budgets on LCP/CLS, SEO (#513/#514) and a11y (#66/#266) against the booted web container | Yes (PRs only) — a `lighthouse` job |
| Load (on-demand) | `load/k6/*.js` (k6) | Hot read paths (#523/#372) and the gateway login limiter under concurrency; used manually to size the VPS | No — on-demand only, not a gate |
| Coverage | per-package `npm run coverage` | v8 coverage for the web app and every service, with a low ratchet-floor threshold so coverage can't silently regress; uploaded to Codecov for per-PR diff-coverage | Yes — a separate `coverage` job per package |

## Running each layer

```bash
# Web app (repo root) — lib + component tests, finishes in a few seconds
npm run test          # vitest run --dir src
npm run test:watch

# One service
cd services/provider-service && npm run test

# Coverage (any package) — enforces the ratchet-floor threshold
npm run coverage      # writes ./coverage + a text summary

# E2E smoke against the compose stack (needs the stack up and seeded)
docker compose up -d --build
npm run e2e           # scripts/e2e-smoke.sh — expect "…, 0 failed" on success

# Browser E2E (Playwright) against the running, seeded stack
npx playwright install --with-deps chromium   # one-time (CI installs its own)
npx playwright test                            # all specs, chromium + @mobile
npx playwright test --project=chromium         # desktop only
npx playwright test e2e/admin-providers.spec.ts  # a single spec
npx playwright show-report                     # open the last HTML report
# Point at a non-default stack with E2E_BASE_URL=http://host:port

# Lighthouse budgets against the running web app (needs @lhci/cli)
npx @lhci/cli@0.15.1 autorun   # collect → assert (.lighthouserc.json) → upload

# Load testing (k6) — on-demand, needs the k6 binary (brew install k6)
BASE_URL=http://localhost:3000 k6 run load/k6/browse.js
BASE_URL=http://localhost:3000 k6 run load/k6/login.js
```

Playwright specs live under `e2e/` and run with Playwright's own runner —
completely separate from the vitest web suite (`npm test`, scoped to
`--dir src`), so neither runner picks up the other's files. They drive a
*running, seeded* stack (nothing is stubbed); bring the stack up first. Seeded
demo accounts (all `password123`) back the specs: `admin@baas.lk` for the admin
render, `dilani@example.com` for the verified-inquiry happy path, and a
freshly-registered customer for the email-unverified gate.

CI (`.github/workflows/ci.yml`) runs on pushes and PRs to `dev` and `prod`, in
these jobs:

- **`web`** — a matrix of `typecheck` / `lint` / `test` / `build` for the web app.
  `lint` includes the `i18next/no-literal-string` rule (error), which fails the
  build on any hardcoded, untranslated JSX text in `src/app` / `src/components`
  — route new copy through `src/lib/i18n.ts` instead (see
  [Bilingual EN/SI](features/i18n-and-theme.md#guarding-against-hardcoded-strings)).
- **`services`** — a matrix of `typecheck` / `test` / `build` across all ten
  service packages (identity, provider, review, job, notification, media, chat,
  search, trust-safety, api-gateway).
- **`coverage`** — `npm run coverage` for the web app and each service (eleven
  packages), enforcing the low baseline thresholds in each package's vitest
  config and uploading the reports as artifacts. A ratchet, not a gate: it
  passes today and only trips if coverage regresses below the floor (#262). Each
  package's coverage is also uploaded to **Codecov** (per-package `flags`) so PRs
  get diff-coverage comments (#671). Public repos don't strictly need a token;
  set the `CODECOV_TOKEN` repo secret for more reliable uploads. The upload never
  fails the build (`fail_ci_if_error: false`) — it is visibility, not a gate.
- **`e2e`** — pull requests only: boots the whole compose stack (via the
  `./.github/actions/boot-stack` composite action, which bakes + boots + seeds
  with `SEED_DEMO_DATA=true` — the prod images run as `NODE_ENV=production`,
  where seeding is otherwise refused), and runs `scripts/e2e-smoke.sh` against it
  (#241). Kept separate so booting the full stack never blocks the fast
  per-package matrix.
- **`playwright`** — pull requests only: boots the same stack (same composite
  action) and runs the browser E2E specs (`e2e/*.spec.ts`) in Chromium against
  it (#671). Complements — does not replace — the curl smoke: a real browser
  catches the client-side navigation, hydration and full SSR-crash regressions
  (the #706 `/admin/providers` error boundary) that the API-only smoke missed.
  Uploads the HTML report + traces/screenshots/video as the `playwright-report`
  artifact for triage.
- **`lighthouse`** — pull requests only: boots the same stack and runs Lighthouse
  CI (`@lhci/cli`) against the web container, asserting the lenient ratchet-floor
  budgets in `.lighthouserc.json` (LCP/CLS + SEO + a11y). Budgets start lenient
  and should be ratcheted up over time — treat every bump as one-way. Reports
  upload to Lighthouse temporary public storage (a link is printed in the log);
  no secret required.
- **`prod-compose`** — validates `docker-compose.prod.yml` (`docker compose
  config`) and `deploy/Caddyfile` (`caddy validate`) with dummy secrets, so the
  file that actually ships fails CI instead of the live deploy (#512; see
  [OPERATIONS.md](OPERATIONS.md)).
- **`knip`** — a dead-code / unused-dependency scan across all 11 packages
  (#673). **Report-only** for now (`continue-on-error`) so it never fails CI on
  day one; see [Dead-code scanning (knip)](#dead-code-scanning-knip) below.

## Local pre-flight: git hooks (Lefthook + commitlint)

[Lefthook](https://lefthook.dev/) runs a few **fast** checks on your own machine
so obvious breaks and non-conventional commit messages are caught before CI
(#673). It is a pre-flight, **not** a replacement for CI — CI still runs the full
per-package matrix.

The hooks (`lefthook.yml`) are installed automatically by the root `prepare`
script on `npm install`; run `npx lefthook install` manually if you skipped
lifecycle scripts.

| Hook | What runs | Why it's fast |
| --- | --- | --- |
| `pre-commit` | `eslint` on the **staged** web source files only | Lints just what you changed |
| `pre-push` | `npm run typecheck` (web) | Seconds; catches the obvious type break |
| `commit-msg` | `commitlint` (`commitlint.config.mjs`, Conventional Commits) | Enforces the CLAUDE.md commit-title contract |

Skipping, for emergencies:

```bash
LEFTHOOK=0 git commit ...              # skip all hooks (or: git commit --no-verify)
LEFTHOOK_EXCLUDE=commitlint git commit # skip one hook
npx lefthook uninstall                 # remove the hooks entirely
```

## Dead-code scanning (knip)

[knip](https://knip.dev/) flags unused files, exports and dependencies across
the workspace (#673). Run it locally with `npm run knip` (from the repo root);
the config is `knip.json`.

Because this monorepo is **not npm-hoisted** — every service is its own package
with its own `node_modules` — the config declares `services/*` as workspaces and
suppresses a handful of layout artifacts that aren't real findings (`tsx` /
`prisma` binaries and the `pg` adapter dep, resolved per-service; the Next.js
`server-only` marker; the `tailwindcss` engine). What's left is genuine signal —
today ~100 unused exports/types, mostly the deliberately-uniform per-service
`lib/http.ts` template helpers plus unused constants.

In CI the **`knip`** job installs every package and runs the same scan, but it is
**report-only** (`continue-on-error`) so it can't fail a PR on day one — there's
a backlog to triage first. Once that's burned down, drop `continue-on-error` to
promote it to a hard gate (matching the report-first bias in
[CI_ADDITIONS.md](CI_ADDITIONS.md)).

## What belongs where

- **Pure logic → `src/lib` with a colocated `*.test.ts`.** If a function has
  no `next/headers`/`fetch` dependency, it gets a plain node-environment unit
  test next to it. Example: `src/lib/i18n.test.ts` walks the `en` and `si`
  dictionaries and fails if a string is added to one locale only — the type
  checker cannot catch untranslated category/district label maps, this test
  does.
- **Client component behavior → colocated `*.test.tsx`.** Component tests run
  in jsdom (opt in per file with a `// @vitest-environment jsdom` pragma; the
  default stays `node` so lib tests pay no DOM overhead). Mock the network
  (`vi.stubGlobal("fetch", …)`), browser APIs (clipboard, share) and
  `next/navigation`. Test what the user observes: toasts appearing and
  auto-dismissing, `aria-pressed` toggling optimistically and reverting on
  failure.
- **Server components and `next/headers` modules → not unit tested.** Async
  server components can't be rendered under vitest (see
  `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`), and
  wrappers like `src/lib/api.ts`, `auth.ts`, `locale.ts` and
  `categories-server.ts` are thin plumbing over `cookies()`/`fetch`. Their
  behavior is covered end to end by the smoke suite instead.
- **S2S behavior → gateway app tests.** Anything about how requests are
  routed, authenticated, CSRF-checked or rate-limited across services belongs
  in `services/api-gateway/src/app.test.ts`, where upstreams are stubbed and
  the forwarded request can be asserted on.
- **Cross-service user flows → `scripts/e2e-smoke.sh`.** Register → browse →
  inquire → review style flows that need real databases and all the services
  talking to each other.
- **Authed page-render (SSR-crash) guards → `scripts/e2e-smoke.sh`.** The
  `check_renders` helper fetches the SSR HTML of key authenticated pages with
  the already-logged-in cookie jars — `/admin`, `/admin/providers`,
  `/admin/verifications`, `/admin/users` (admin), `/dashboard` (provider) and
  `/account` (customer) — and fails if the response either lacks a
  page-specific marker or contains the route error-boundary copy ("Something
  went wrong", from `src/components/ui/RouteError.tsx` / `global-error.tsx`).
  The API-only admin checks previously missed a full SSR crash on
  `/admin/providers` (#706) because the layout still shipped "Baas" while the
  page body fell back to the error boundary — these guards catch that (#711).

## Accessibility

What's automated and what still needs a human (#66):

- **Automated — `src/components/a11y.test.tsx`.** Each test renders a
  high-traffic component (Navbar's mobile menu and user menu, provider cards,
  filter/search bars, every auth page — login, register choice, customer
  registration, all four provider-wizard steps, forgot/reset-password,
  verify-email — the inquiry/review/security and job post/respond forms, the
  email-verify banner, message thread, chat assistant, report modal, photo
  lightbox) and runs
  [axe-core](https://github.com/dequelabs/axe-core) on the result, failing on
  any violation axe rates *serious* or *critical* — missing accessible names,
  broken label/input association, bad ARIA wiring, missing image alt text.
  The modal tests additionally assert focus and scroll behavior directly:
  focus moves into the dialog on open, background scrolling locks
  (`useScrollLock`), `Escape` closes it, and focus + scrolling return to the
  trigger. The form tests also submit invalid input and assert the error
  wiring (#378): inline errors linked to their fields via
  `aria-describedby`/`aria-invalid` with focus moved to the first invalid
  control, and the provider wizard's focus-managed error summary whose
  in-page links focus the offending field. The wizard test likewise asserts
  real form semantics (Enter submits each step) and that focus moves to the
  step heading on step change. Add new interactive components to this file
  as they're built, and surface their errors through the `Field` error prop
  / `src/components/ui/FormError.tsx` helpers so the wiring stays
  consistent.
- **Not automatable here — needs a browser.** axe's `color-contrast` rule is
  disabled because jsdom has no layout engine; contrast must be re-verified
  in a real browser (both light and dark themes — the token ramps in
  `globals.css` are independent). Also outside jsdom's reach: focus
  visibility, zoom/reflow at 200–400%, `prefers-reduced-motion` behavior, and
  touch-target sizes. Run Lighthouse or the axe DevTools extension against
  the running app for these.
- **Needs a human.** Screen-reader walkthroughs (VoiceOver/NVDA) of the two
  killer flows — search → profile → inquiry, and register → dashboard →
  photo upload/reorder — in both English and Sinhala, and keyboard-only
  passes over the photo lightbox and the drag-reorder grid (buttons provide
  the keyboard fallback for dragging).

## Deliberate gaps

- **Browser E2E is a thin, high-value slice — not exhaustive.** The Playwright
  tier (`e2e/*.spec.ts`) covers the conversion-critical + regression-prone flows
  (home, browse → detail, register validation, login, the verified-email gate,
  the `/admin/providers` render) and one mobile spot-check, in Chromium only.
  It deliberately does not attempt full cross-browser, visual-regression or
  every-page coverage — add specs when a flow is both high-value and not already
  guarded by component tests + the curl smoke.
- **The e2e smoke, Playwright and Lighthouse suites run on PRs and locally, not
  on every push.** The `e2e`, `playwright` and `lighthouse`
  jobs boot the stack only for pull requests (booting + building the whole stack
  is heavy), and the suites still need a running, seeded stack when run locally.
  Run them before merging anything that touches more than one service.
- **Exact `Intl` strings aren't pinned.** Locale formatting tests assert the
  parts that matter (grouping, Sinhala month names, locale divergence) rather
  than full formatted strings, because ICU output can shift between Node
  releases.

## Known gaps (tracked)

Route- and integration-level coverage is still thin in places; the open
`[TESTING]` issues track the remaining work:

- **#256** — identity auth routes untested (password reset & email verification)
- **#257** — provider-service route and authorization tests missing
- **#258** — media-service upload pipeline routes untested; media absent from e2e
- **#259** — review-service and job-service route handlers untested
- **#260** — no integration/contract tests for the service-to-service (`/internal`) APIs
- **#261** — conversion-critical frontend forms lack component tests
- **#262** — CI coverage collection + ratchet-floor thresholds (landed; raise the floor as the suites grow)
