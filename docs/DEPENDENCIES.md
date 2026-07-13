# Dependency maintenance

Forward-looking dependency decisions and migration plans (#391). The routine
machinery — weekly Dependabot across npm (root + `services/*`), GitHub Actions
and docker base images, plus the CI `npm audit` and Trivy gates — is covered in
[DEPLOYMENT.md](DEPLOYMENT.md) and the security-scan workflow. This page records
the deliberate, non-routine calls so they aren't re-litigated from memory.

## `@hono/node-server` 1.x → 2.x migration plan

**Status: planned, not urgent.** We pin `@hono/node-server@^1.19.13`
(resolves 1.19.14) as a direct dependency in all 8 services **and** via an
`overrides` block in all 9 manifests (root + 8 services) so transitive copies
can't drift. The 2.x line is current upstream — `2.0.0` shipped 2026-04-21 and
the latest is `2.0.8` (2026-07-02).

### Why we're not exposed today

- The 1.19.x serve-static advisories are already patched in the pinned range,
  and **no service uses `serveStatic`** (verified — the only imports are
  `serve` in each service's `src/index.ts` and `getConnInfo` from
  `@hono/node-server/conninfo` in the gateway's rate limiter).
- The path-traversal fixed in 2.0.5 is Windows-only serve-static behavior;
  deployment is Linux (alpine) and serve-static is unused.

The reason to migrate anyway: upstream focus is on 2.x, so the 1.x line may
stop receiving backports. Treat this as scheduled maintenance, not a security
response.

### What 2.x changes (verified against npm + upstream releases, July 2026)

- **Node.js floor raised to >= 20** (`engines`), dropping Node 18. Our images
  run Node 26 and `engines` is `>=22` everywhere — no impact.
- **Vercel adapter removed** (`@hono/node-server/vercel`). We don't use it.
- Peer dependency `hono@^4` — all services are on `hono@^4.12.29`. Compatible.
- The `./conninfo` and `./serve-static` subpath exports **still exist** in
  2.0.8, so the gateway's `getConnInfo` import keeps working.
- Otherwise a performance release (faster body parsing / URL and header
  fast-paths) plus first-class WebSocket support; the `serve()` /
  `server.close()` API surface we use is unchanged.

### Migration steps (single PR)

1. Bump the direct dependency **and** the `overrides` entry to `^2.0.8` (or
   latest) in all 9 `package.json` files **together** — a partial bump leaves
   `overrides` fighting the dependency range and `npm ci` fails on the
   conflict.
2. `npm install` in the root and each service to refresh all 9 lockfiles.
3. Per package: `npm run typecheck && npm test && npm run build`.
4. Full stack: `docker compose up -d --build` + `npm run e2e` — exercises every
   service's `serve()` boot, the gateway's `getConnInfo`-based rate limiting
   and the graceful-shutdown (`server.close`) path.
5. Watch the first deploy's health-gate; auto-rollback covers a bad boot.

## Runtime Node.js: stay on 26 (decision)

**Decision: keep production on `node:26-alpine`, knowingly.** All 9 Dockerfiles
pin it by digest, with the `# dependabot: node:26-alpine` comment keeping
Dependabot's digest bumps on the same tag stream.

Facts (nodejs/Release schedule, checked 2026-07-13):

| Line | Status today | Active LTS | Maintenance | End of life |
| --- | --- | --- | --- | --- |
| 24 "Krypton" | Active LTS | 2025-10-28 | 2026-10-20 | 2028-04-30 |
| 26 | Current | 2026-10-28 | 2027-10-20 | 2029-04-30 |

Rationale:

- Node 26 enters **Active LTS on 2026-10-28** — about 3½ months out — and 24
  moves to **maintenance mode the same week** (2026-10-20). Downgrading to 24
  now would buy one quarter of "Active LTS" label, then leave us on a
  maintenance line and force a second base-image migration back to 26.
- Staying on 26 means no image churn and the longest runway (EOL 2029-04-30).
  The Current line still receives security releases, and digest-pinned bases +
  Dependabot docker updates + the Trivy OS-package gate keep patches flowing.
- Everything in the stack supports both lines (`engines: node >=22`,
  `@hono/node-server` needs only >= 18/20), so if a 26-line regression turns up
  before October, `node:24-alpine` is a drop-in fallback.

Related, intentionally unchanged: CI's `setup-node` uses Node 22 — that tests
the `engines` floor (`>=22`), the minimum we claim to support, not the
container runtime. Revisit raising `engines` and the CI version after 26
reaches LTS.

## Known-behind dev tooling (no action)

`eslint` 9 (vs 10) and `typescript` 6 (vs 7) are dev-only and gated by
`eslint-config-next` (see the Dependabot ignore rule for eslint majors).
Unblock when `eslint-config-next` supports them.
