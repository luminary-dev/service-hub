# Contributing to Service Hub

Thanks for working on **Service Hub** (Baas.lk), the bilingual (English/Sinhala)
services marketplace for Sri Lanka. This file is the quick entry point; the full
engineering contract lives in **[`CLAUDE.md`](CLAUDE.md)** (it applies to every
contributor, human or AI) and the technical reference lives in
**[`docs/`](docs/README.md)**. Read those before your first change.

> **Working with an AI assistant?** [`CLAUDE.md`](CLAUDE.md) + [`AGENTS.md`](AGENTS.md)
> are the contract it must follow. Everything below is the human-facing summary
> of the same rules.

## Before you start

- Read [`docs/README.md`](docs/README.md) (the docs index) and
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) to understand the monorepo: a
  gateway-fronted set of Hono + Prisma services plus a Next.js 16 web app.
- **Verify before you change.** Read the actual current routes, schema and env
  for the area you're touching — don't trust memory or training data. This
  Next.js is modified; check `node_modules/next/dist/docs/` when in doubt.
- **Product scope:** no pricing, payments, transactions, commission or billing
  until v0.2 — we're building an audience first. Don't add or extend that code.

## Local setup

```bash
./scripts/setup.sh            # one-time
./scripts/dev-all.sh          # run all services + web on the host, OR:
docker compose up -d --build  # run the full stack in Docker
```

Seed demo data (prod images refuse unless overridden):

```bash
for s in identity-service provider-service review-service job-service; do
  docker compose exec -e SEED_DEMO_DATA=true "$s" npm run db:seed
done
```

Demo accounts (password `password123`): `admin@baas.lk` (ADMIN), plus demo
providers and customers. **Local data is disposable** — `./scripts/dev-reset.sh`
wipes the volumes and reseeds for a clean stack. Never commit local data files,
and keep seeds to dummy data only (no secrets, real users, or business logic).

## The workflow

1. **Open an issue first** for anything substantive — the project board tracks
   issues, one card per unit of work. Trivial chores (deps, docs, tiny fixes)
   can go straight to a PR.
2. **Branch** off `dev` (never commit to `dev` or `prod` directly):
   - Issue work: `issue-<number>-<kebab-slug>` (e.g. `issue-231-bulk-actions`)
   - Otherwise: `<type-or-author>/<kebab-topic>` (e.g. `feat/provider-search`)
   - UI redesign: `redesign/<number>-<slug>`
3. **Make the change** matching the surrounding code's style and comment density.
4. **Update the docs you affected in the same PR** — code and docs must never
   drift. Endpoint/behavior/env/data-model changes update the relevant
   [`docs/`](docs/README.md) file(s) and/or the service `README.md`.
5. **Verify locally** for every package you touched:
   `npm run typecheck && npm test && npm run build` (the web app also
   `npm run lint`). If the production build guard trips, run
   `AUTH_SECRET=ci npm run build`. Cross-service changes: bring up the stack and
   run `npm run e2e`.
6. **Open a PR** into `dev`, fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md)
   checklist, and link every issue it resolves.

## Commits & PRs

- **Conventional Commits** for both commit messages and PR titles:
  `type(scope): imperative summary`.
  - `type`: `feat` | `fix` | `chore` | `docs` | `ci` | `refactor` | `test` | `perf`
  - `scope`: the service or area (`provider`, `gateway`, `web`, `backend`, `ci`, …)
  - e.g. `feat(provider): add bulk suspend`, `docs: refresh deployment guide`
- Explain the *why* for non-obvious changes.
- **Close issues explicitly:** put `Closes #<n>` on its **own line** for each
  issue — a comma-separated list (`Closes #1, #2`) only closes the first.
- Migrations are **hand-written** and applied on service start; never edit a
  migration that has already been applied — add a new one.

## Merging

Never merge until **all CI checks are green, there are no conflicts, and the
branch is up to date with `dev`.** No `--admin` bypass of failing or queued
checks — the `dev` and `prod` rulesets require an up-to-date branch, review, and
all-green CI. Releasing is a PR from `dev → prod`; the push to `prod` triggers
the deploy.

## Issues

- Title carries a `[PREFIX]` matching the type (e.g. `[SECURITY]`, `[BACKEND]`,
  `[UI]`, `[PERFORMANCE]`, `[DEVOPS]`, `[TESTING]`, `[A11Y]`, `[DOCS]`).
- Every issue gets a **type label** (`security`, `backend`, `ui`, …) **and** a
  `service:` label where it applies. Use the templates in
  [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE).
- **Security vulnerabilities:** do not open a public issue — report privately per
  [`SECURITY.md`](SECURITY.md).

## Where docs live

- **This repo's [`docs/`](docs/README.md)** — the technical + process reference
  that versions with the code (architecture, deployment, ops, authz, endpoint
  contracts).
- **[`luminary-dev/service-hub-docs`](https://github.com/luminary-dev/service-hub-docs)**
  (GitBook) — narrative team docs: onboarding, workflow, day-to-day process.

Each service is **mirrored read-only** to its own `luminary-dev/<service>` repo.
Never push or open PRs there — all changes land via monorepo PRs and are synced
out.
