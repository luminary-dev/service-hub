# Service Hub docs

Technical and process reference for the **Service Hub** (Baas.lk) monorepo — the
canonical source for how the system is built, deployed and operated. These are
the docs you reach for *after* a deploy: architecture contracts, the deployment
and operations runbooks, the authorization and admin models, feature notes, and
the security posture. Per-service API detail lives in each
`services/<name>/README.md`.

> **Single source of truth.** This `docs/` folder is the **one** home for
> technical + process documentation — endpoint contracts, runbooks, onboarding
> and design tokens that version alongside the code. The team's **GitBook** space
> is published *directly from this folder* via GitBook Git Sync (`.gitbook.yaml`
> at the repo root sets `docs/` as the content root and [`SUMMARY.md`](SUMMARY.md)
> as the nav). Update the docs here and GitBook re-renders — there is no separate
> docs repo to keep in sync.

## Index

| Doc | What's in it |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The microservice split: the gateway, the backend services + web, per-service Postgres ownership, and the internal-HTTP (S2S) contract with the shared secret. Overview + diagram here; details split under [`architecture/`](architecture/). |
| [API.md](API.md) | The consolidated endpoint reference — every public `/api/*` route (method, auth/role, params, response) and every internal `/internal/*` S2S route, derived from the gateway routing table and the service handlers. Split under [`api/`](api/). |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production topology — pre-built GHCR images behind Caddy on a single Docker host, the `dev → prod` branch/CD model, and `docker-compose.prod.yml`. |
| [OPERATIONS.md](OPERATIONS.md) | Day-2 operations runbook: health checks, logs, restarts, migrations and routine maintenance. |
| [AUTHZ.md](AUTHZ.md) | The authorization model — session JWTs, tiered roles, identity-header forwarding, and how each service enforces access. |
| [ADMIN.md](ADMIN.md) | The admin surface: provider moderation, user management, impersonation, job management and the audit logs behind them. Split under [`admin/`](admin/). |
| [FEATURES.md](FEATURES.md) | Product feature reference — what the marketplace does end to end, and which service owns each piece. Split under [`features/`](features/). |
| [SECURITY.md](../SECURITY.md) | Security policy, supported versions and the responsible-disclosure process (repo root). |
| [BACKUPS.md](BACKUPS.md) | Database backup & disaster recovery: `scripts/backup-dbs.sh` dumps, upload storage (R2 vs local volumes), the restore runbook and offsite copies. |
| [SECRET_ROTATION.md](SECRET_ROTATION.md) | Operator runbook for rotating the platform secrets (`AUTH_SECRET`, `INTERNAL_API_SECRET`, `POSTGRES_PASSWORD`, third-party keys): the blast radius of each, the update-secret → redeploy → verify procedure, and rollback. |
| [TESTING.md](TESTING.md) | The test strategy layer by layer — service unit tests, gateway app tests, web unit tests — and what belongs where. |
| [CI_ADDITIONS.md](CI_ADDITIONS.md) | A menu of further CI checks/pipelines we can add (actionlint, link checking, service ESLint, dependency-review, SBOM/cosign, …) — rationale, effort and gate-vs-report for each, plus what already runs (incl. CodeQL via default setup). |
| [RATE_LIMITING.md](RATE_LIMITING.md) | The gateway's Redis-backed sliding-window limiter: the per-route budget table, the in-memory fallback and the client-IP (XFF) caveat (#201). |
| [EMAIL_SETUP.md](EMAIL_SETUP.md) | Transactional email via notification-service + Resend: the API key, the verified sending domain and the console fallback when unset. |
| [DESIGN.md](DESIGN.md) | The web design system (UI 2.0): the blueprint visual language, `globals.css` OKLCH tokens, light/dark theming and the shared `src/components/ui/*` primitives. |

Some of these docs are authored and maintained in parallel; links point at their
canonical paths whether or not the file is present in your checkout yet.
