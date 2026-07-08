# Testing

How the project is tested, layer by layer: what exists, how to run it, and
what kind of test belongs where.

## The layers

| Layer | Where | What it covers | Runs in CI |
| --- | --- | --- | --- |
| Service unit tests | `services/*/src/**/*.test.ts` | Each service's routes, validation, auth and business logic (vitest, ~390 tests across the eight backend services + gateway) | Yes — per-service `npm run test` |
| Gateway app tests | `services/api-gateway/src/app.test.ts` + `src/lib/*.test.ts` | Gateway routing, cookie/CSRF/rate-limit behavior, S2S forwarding — upstream services are stubbed, nothing real is dialed | Yes — part of the gateway suite |
| Web unit tests | `src/lib/*.test.ts`, `src/proxy.test.ts` | Pure logic: locale formatting, i18n dictionary parity, category/district/price-type lookups, sort normalization, the `/api/*` proxy rewrite | Yes — web `npm run test` |
| Web component tests | `src/components/*.test.tsx` | High-value client components (toasts, favorite/share buttons) rendered with Testing Library in jsdom; `fetch`, clipboard and `next/navigation` are mocked | Yes — same web suite |
| Accessibility checks | `src/components/a11y.test.tsx` | axe-core runs against ~12 rendered components (nav, cards, filters, forms, chat, modals) and fails on any serious/critical WCAG violation | Yes — same web suite |
| E2E smoke | `scripts/e2e-smoke.sh` | 46 checks against the full docker-compose stack: health, auth, favorites, inquiries, reviews, jobs, admin moderation, CSRF | Yes (PRs only) — a dedicated `e2e` job boots the compose stack; also run locally |
| Coverage | per-package `npm run coverage` | v8 coverage for the web app and every service, with a low ratchet-floor threshold so coverage can't silently regress | Yes — a separate `coverage` job per package |

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
npm run e2e           # scripts/e2e-smoke.sh — "46 passed, 0 failed" on success
```

CI (`.github/workflows/ci.yml`) runs on pushes and PRs to `dev` and `prod`, in
four jobs:

- **`web`** — a matrix of `typecheck` / `lint` / `test` / `build` for the web app.
- **`services`** — a matrix of `typecheck` / `test` / `build` across all eight
  service packages (identity, provider, review, job, notification, media, chat,
  api-gateway).
- **`coverage`** — `npm run coverage` for the web app and each service (nine
  packages), enforcing the low baseline thresholds in each package's vitest
  config and uploading the reports as artifacts. A ratchet, not a gate: it
  passes today and only trips if coverage regresses below the floor (#262).
- **`e2e`** — pull requests only: boots the whole compose stack, seeds the
  databases with `SEED_DEMO_DATA=true` (the prod images run as
  `NODE_ENV=production`, where seeding is otherwise refused), and runs
  `scripts/e2e-smoke.sh` against it (#241). Kept separate so booting the full
  stack never blocks the fast per-package matrix.

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

## Accessibility

What's automated and what still needs a human (#66):

- **Automated — `src/components/a11y.test.tsx`.** Each test renders a
  high-traffic component (Navbar's mobile menu, provider cards, filter/search
  bars, the login/registration/inquiry/review/security forms, message thread,
  chat assistant, report modal, photo lightbox) and runs
  [axe-core](https://github.com/dequelabs/axe-core) on the result, failing on
  any violation axe rates *serious* or *critical* — missing accessible names,
  broken label/input association, bad ARIA wiring, missing image alt text.
  The modal tests additionally assert focus behavior directly: focus moves
  into the dialog on open, `Escape` closes it, and focus returns to the
  trigger. Add new interactive components to this file as they're built.
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

- **No browser-automation layer.** There is no Playwright/Cypress tier;
  the smoke suite exercises pages over HTTP (`curl` + content assertions) but
  nothing drives a real browser, so client-side navigation, hydration and
  visual regressions are unverified. Playwright is the obvious candidate once
  there's a product reason (e.g. a checkout-like multi-step flow whose
  breakage wouldn't be caught by component tests + smoke checks).
- **The e2e smoke suite runs on PRs and locally, not on every push.** The `e2e`
  job boots the stack only for pull requests (booting + building the whole stack
  is heavy), and the suite still needs a running, seeded stack when run locally.
  Run it before merging anything that touches more than one service.
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
