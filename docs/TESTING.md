# Testing

How the project is tested, layer by layer: what exists, how to run it, and
what kind of test belongs where.

## The layers

| Layer | Where | What it covers | Runs in CI |
| --- | --- | --- | --- |
| Service unit tests | `services/*/src/**/*.test.ts` | Each service's routes, validation, auth and business logic (vitest, 200+ tests across the six services) | Yes — per-service `npm run test` |
| Gateway app tests | `services/api-gateway/src/app.test.ts` + `src/lib/*.test.ts` | Gateway routing, cookie/CSRF/rate-limit behavior, S2S forwarding — upstream services are stubbed, nothing real is dialed | Yes — part of the gateway suite |
| Web unit tests | `src/lib/*.test.ts`, `src/proxy.test.ts` | Pure logic: locale formatting, i18n dictionary parity, category/district/price-type lookups, sort normalization, the `/api/*` proxy rewrite | Yes — web `npm run test` |
| Web component tests | `src/components/*.test.tsx` | High-value client components (toasts, favorite/share buttons) rendered with Testing Library in jsdom; `fetch`, clipboard and `next/navigation` are mocked | Yes — same web suite |
| E2E smoke | `scripts/e2e-smoke.sh` | 42 checks against the full docker-compose stack: health, auth, favorites, inquiries, reviews, jobs, admin moderation, CSRF | No — run locally (needs the compose stack) |

## Running each layer

```bash
# Web app (repo root) — lib + component tests, finishes in a few seconds
npm run test          # vitest run --dir src
npm run test:watch

# One service
cd services/provider-service && npm run test

# E2E smoke against the compose stack
docker compose up -d --build
npm run e2e           # scripts/e2e-smoke.sh — "42 passed, 0 failed" on success
```

CI (`.github/workflows/ci.yml`) runs `typecheck`/`lint`/`test`/`build` for the
web app and `typecheck`/`test`/`build` for every service on each PR.

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
  inquire → review style flows that need real databases and all six services
  talking to each other.

## Deliberate gaps

- **No browser-automation layer.** There is no Playwright/Cypress tier;
  the smoke suite exercises pages over HTTP (`curl` + content assertions) but
  nothing drives a real browser, so client-side navigation, hydration and
  visual regressions are unverified. Playwright is the obvious candidate once
  there's a product reason (e.g. a checkout-like multi-step flow whose
  breakage wouldn't be caught by component tests + smoke checks).
- **The e2e smoke suite is local-only.** It needs the compose stack up and is
  not wired into CI. Run it before merging anything that touches more than
  one service.
- **Exact `Intl` strings aren't pinned.** Locale formatting tests assert the
  parts that matter (grouping, Sinhala month names, locale divergence) rather
  than full formatted strings, because ICU output can shift between Node
  releases.
