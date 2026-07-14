@AGENTS.md

# Working in this repo (with Claude or any agent)

This file is the contract for anyone doing engineering work here — especially with an AI assistant. Read it before you touch anything, and follow it exactly. When in doubt, verify against the code and the docs; do not rely on training-data assumptions (see the Next.js note above — this Next.js is modified).

## What this project is

`service-hub` (Baas.lk) is a bilingual (English/Sinhala) services marketplace for Sri Lanka. It's a monorepo:

- **10 backend services** (Hono + Prisma 7, one Postgres DB each where stateful): `api-gateway` (:4000, the only public entry), `identity` (:4001), `provider` (:4002), `review` (:4003), `job` (:4004), `notification` (:4005), `media` (:4006), `chat` (:4007), `search` (:4008, PostGIS-backed discovery index), `trust-safety` (:4009, unified reports/moderation — dark-launched, not yet routed).
- **Next.js 16 web app** (:3000, App Router, Turbopack) — proxies `/api/*` to the gateway at request time.
- **Postgres** (host 5433) + **Redis**. Deployed as pre-built GHCR images behind **Caddy** via Docker Compose.

Start with `docs/README.md` (the docs index) and `docs/ARCHITECTURE.md`.

## Repo layout & commands

The web app lives at the **repo root** (`src/`, root `package.json`); each backend service is its **own npm package** with its own `package.json` and `node_modules` under `services/<dir>`. Directory names carry a `-service` suffix except the gateway: `services/api-gateway`, `services/identity-service`, `services/provider-service`, `services/review-service`, `services/job-service`, `services/notification-service`, `services/media-service`, `services/chat-service`, `services/search-service`, `services/trust-safety-service`.

Run commands **from the package you're touching** (repo root for web, `services/<dir>` for a service):

```bash
npm run typecheck && npm test && npm run build   # every package; web also: npm run lint
npm test -- src/lib/format.test.ts               # single test file (vitest filter; same in services)
npm run test:watch                               # watch mode
```

- Tests are **colocated** `*.test.ts(x)` files next to the source they cover (no `__tests__/` tree). Web tests use jsdom via `vitest.config.web.mts` at the root; services use their own `vitest.config.ts`. See `docs/TESTING.md` for what belongs at which layer.
- The **6 stateful services** — identity, provider, review, job, notification, trust-safety — each have a `prisma/` dir (schema + hand-written migrations + seed). search-service also has a `prisma/` dir, but `search_db` is a derived, rebuildable index (excluded from backups; repopulate via its reindex endpoint). Media, chat and the gateway have no DB. Prisma-service extras: `npm run db:migrate:dev`, `npm run db:seed`.
- Web app anatomy: `src/proxy.ts` is Next 16's rename of middleware — it does the runtime `/api/*` → gateway rewrite and the `/si` Sinhala locale prefix (it *owns* the trusted `x-locale` header). Server components skip the proxy and call the gateway directly via `src/lib/api.ts`. Shared helpers in `src/lib/` (i18n, roles, links, locale), UI primitives in `src/components/ui/`.
- Gateway anatomy: `services/api-gateway/src/lib/routes.ts` is the routing table (the source for `docs/API.md`), plus `session.ts` (JWT), `rate-limit.ts` (Redis sliding window), `csrf.ts`, `proxy.ts` (forwarding + identity headers).

## Product constraints (read first)

- **NO pricing, payments, transactions, commission, or billing until v0.2.** We are attracting an audience first; monetization is deliberately out of scope. Do not add payment/commission code, a payments service, price-agreement flows, or transaction records. If you find leftover billing code, it should be removed, not extended.
- Keep the surface small and the flows free-to-use for now.

## Golden rules

1. **Verify before you change.** Read the actual current code — routes, schema, env — before editing. Never assume an endpoint, field, flag, or API shape from memory. For any change touching an API, re-check the route handlers and `services/api-gateway/src/lib/routes.ts`, and the endpoint reference in `docs/ARCHITECTURE.md`.
2. **Docs are the source of truth we build on later.** If your change alters behavior, an endpoint, an env var, a process, or the data model, **update the relevant doc(s) in the same PR**. The `docs/` tree is the single canonical home for technical + process docs (onboarding, reference, runbooks). The team's GitBook space is published **directly from `docs/`** via Git Sync (`.gitbook.yaml` → `docs/` root + `docs/SUMMARY.md` nav), so updating `docs/` is all that's needed — there is no separate docs repo to sync. Never let code and docs drift.
3. **Never merge a PR unless ALL checks pass, there are no conflicts, and the branch is up to date with `dev`.** No `--admin` bypass of failing/queued checks. The `dev` and `prod` rulesets are strict (up-to-date + required review + all CI green). Merge only when the state is genuinely CLEAN.
4. **No AI attribution.** Do not add `Co-Authored-By:` trailers to commits or "Generated with …" footers to PR bodies.

## The loop (every task)

1. Read this file + `docs/README.md` and the docs for the area you're touching.
2. **Verify current reality** — read the routes/schema/env you'll change; don't trust memory.
3. Make the change on a branch (see naming below), matching surrounding style.
4. **Update the docs** you affected in the same branch.
5. Verify locally: `typecheck && test && build` for every touched package (web also `lint`).
6. Open a PR (Conventional-Commit title, `Closes #n`, fill the template).
7. Merge **only** when every check is green, there are no conflicts, and the branch is up to date. Then confirm the docs match what shipped.

## Branch naming

- Work on an issue: `issue-<number>-<kebab-slug>` (e.g. `issue-231-bulk-actions`).
- Otherwise: `<type-or-author>/<kebab-topic>` (e.g. `feat/provider-search`, `dhanika/service-hardening`, `docs/architecture`).
- UI redesign work: `redesign/<number>-<slug>`.
- Never commit directly to `dev` or `prod`. Branch, PR, review, merge.

## PR titles & bodies

- Title = Conventional Commits: `type(scope): imperative summary`.
  - `type`: `feat` | `fix` | `chore` | `docs` | `ci` | `refactor` | `test` | `perf`.
  - `scope`: the service or area (`provider`, `gateway`, `web`, `backend`, `ci`, `deps`, …).
  - e.g. `feat(provider): add bulk suspend`, `fix(backend): handle P2002 on register`, `docs: refresh deployment guide`.
- Body: what + why, and `Closes #<n>` for every issue the PR resolves (so merge auto-closes them).
- Fill in the PR template checklist (migrations run? env vars added to `.env.prod.example`? tests added? smoke-tested?).

## Commits

- Conventional-commit style messages; imperative mood; explain the *why* for non-obvious changes.
- Match the surrounding code's style, comment density, and naming.

## Issues

- Title carries a `[PREFIX]` matching the type (e.g. `[SECURITY]`, `[BACKEND]`, `[UI]`, `[PERFORMANCE]`, `[DEVOPS]`, `[TESTING]`, `[A11Y]`, `[DOCS]`).
- Every issue gets a **type label** (`security`, `backend`, `ui`, `performance`, `testing`, `devops`, `documentation`, …) **and** a `service:` label where it applies (`service: provider`, `service: identity`, …).
- When **closing** an issue in a `luminary-dev` repo, assign **@dhanikaa**.
- Use the templates in `.github/ISSUE_TEMPLATE/`.

## Project board & assignees

- **The board tracks issues** — one card per unit of work — synced by
  `.github/workflows/add-to-project.yml` on issue open (`Status=Backlog` +
  `Service`). **Pull requests are never separate board cards.**
- **A PR that resolves an issue** links under it: put `Closes #n` in the body,
  and the workflow mirrors the PR's **author onto that issue as the assignee**,
  so the board card shows who's working it. When the PR merges, the issue
  closes and the board moves it to Done.
- **A PR that resolves no issue** gets **no board card** — it's just
  auto-assigned to its author and merges. That's expected for trivial chores
  (deps, docs, tiny fixes); **substantive work should have an issue first** so
  it's tracked on the board.
- Own what you open — don't reassign someone else's PR/issue to yourself.
- Keep GitHub's built-in project auto-add workflow **OFF** — the workflow above
  is the single sync path (double-adding would duplicate cards).

## Verifying changes

- For each package you touched: `npm run typecheck && npm test && npm run build`. For the web app also `npm run lint`.
- The production build needs a secret — CI supplies `AUTH_SECRET=ci-dummy-secret`; locally run `AUTH_SECRET=ci npm run build` if the guard trips.
- Cross-service behavior: bring the stack up (`docker compose up -d --build`) and run `npm run e2e` (`scripts/e2e-smoke.sh`) — it needs a running stack and seeds with `SEED_DEMO_DATA=true`.
- CI runs the same per-package matrix + coverage + the compose e2e + Trivy/npm-audit on every PR. Wait for green.

## Database & migrations

- Prisma migrations are **hand-written** (not generated); the 4 DB services auto-apply them on start via `start:migrate` (`prisma migrate deploy`).
- **Never edit a migration that has already been applied** — add a new one. Prisma rejects checksum drift and the service won't boot.
- Make DDL idempotent-safe where possible (`DROP … IF EXISTS`, guarded `CREATE`).

## Architecture rules you must respect

- **Gateway is the only public entry.** It verifies the session JWT and forwards identity headers (`x-user-id` / `x-user-role` / `x-user-name`) + the internal secret to services. Services trust those headers *only* because of the internal secret — never expose a service port publicly.
- **Service-to-service (S2S):** call peers via their `*_SERVICE_URL` env with the shared `s2s()` helper (adds the internal secret, one bounded retry on idempotent GETs). Read paths degrade gracefully; write-path gates fail loudly.
- **Auth & roles:** roles are `CUSTOMER`, `PROVIDER`, `ADMIN`, `SUPPORT`. `ADMIN` = full admin access; `SUPPORT` = read every admin view + resolve/dismiss reports, nothing destructive. Gate the web with `src/lib/roles.ts` (`isAdminRole` / `hasSupportAccess` / `hasFullAdminAccess`) and the backend with `isFullAdmin` / `isSupportOrAdmin` from each service's `lib/http.ts`. Keep web and backend gates consistent. See `docs/AUTHZ.md`.
- **Storage:** all uploads go through `media-service` → Cloudflare R2 (private bucket, streamed via `/api/files/*`) or local disk. No Vercel Blob. Images are re-encoded with sharp, EXIF-stripped, 5MB, jpeg/png/webp.
- **Secrets:** the repo is public; nothing sensitive in the tree. Runtime config lives in GitHub Actions repo secrets; the deploy renders the server `.env` from them. Gitignored local `.env` files only for dev.

## Deploy & release (summary — see docs/DEPLOYMENT.md + docs/OPERATIONS.md)

- Branch model: work merges to `dev`; releasing is a PR `dev → prod`; the push to `prod` is the deploy trigger.
- CD builds/publishes GHCR images, then (when `DEPLOY_ENABLED=true`) deploys over SSH with a health-gate and auto-rollback. A `v*` git tag cuts a versioned release.
- After a release, sync the read-only service mirrors: `npm run sync:repos`.
- Each service is **mirrored read-only** to its own `luminary-dev/<service>` repo. Never push or open PRs there — all changes land via monorepo PRs and are synced out. Direct pushes to mirrors are blocked by branch protection.

## Local dev quickstart

```bash
./scripts/setup.sh            # one-time
./scripts/dev-all.sh          # run all services + web on the host, OR:
docker compose up -d --build  # run the full stack in Docker
# ...then seed the 6 data services (container images run NODE_ENV=production,
# so the demo seed must be opted into explicitly — `scripts/setup.sh` seeds for
# you on the host path, but the container path does not):
for s in identity-service provider-service review-service job-service notification-service trust-safety-service; do
  docker compose exec -e SEED_DEMO_DATA=true "$s" npm run db:seed
done
```
Demo accounts (all password `password123`): `admin@baas.lk` (ADMIN), plus demo providers and customers. During the container-path seed, `.env not found` (config comes from Compose, not a file) and `job-service: no seed data` (the board starts empty) are both expected.

**Local data is disposable.** We don't preserve or migrate data between runs on
localhost — migrations rebuild the schema on a fresh DB every time. To get a
clean stack, wipe the volumes and reseed:

```bash
./scripts/dev-reset.sh        # docker compose down -v → up -d --build → reseed
```

Don't commit local data files (the gitignored `services/*/data`, DB dumps,
etc.). Seeds must contain **dummy data only** — no production config, secrets,
real users, or business logic (the one exception is the guard that refuses to
seed demo accounts under `NODE_ENV=production`).
