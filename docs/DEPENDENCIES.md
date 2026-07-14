# Dependency maintenance

Forward-looking dependency decisions and migration plans (#391). The routine
machinery — weekly Dependabot across npm (root + `services/*`), GitHub Actions
and docker base images, plus the CI `npm audit` and Trivy gates — is covered in
[DEPLOYMENT.md](DEPLOYMENT.md) and the security-scan workflow. This page records
the deliberate, non-routine calls so they aren't re-litigated from memory.

## `@hono/node-server` 1.x → 2.x migration plan

**Status: planned, not urgent.** We pin `@hono/node-server@^1.19.13`
(resolves 1.19.14) as a direct dependency in all 10 services **and** via an
`overrides` block in all 11 manifests (root + 10 services) so transitive copies
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
  run Node 24 and `engines` is `>=24 <25` everywhere — no impact.
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

## Runtime Node.js: align on 24 LTS (decision, #666)

**Decision: standardize the whole stack on `node:24-alpine` (Active LTS).** All
11 Dockerfiles pin it by digest, with the `# dependabot: node:24-alpine`
comment keeping Dependabot's digest bumps on the same tag stream. `.nvmrc`,
every `engines` field (`>=24 <25`, pinning the major), and every CI
`setup-node` (`node-version: 24`) match — so the runtime that ships is the
runtime CI's `typecheck / test / build`, coverage, and audit legs actually
exercise.

Facts (nodejs/Release schedule, checked 2026-07-13):

| Line | Status today | Active LTS | Maintenance | End of life |
| --- | --- | --- | --- | --- |
| 24 "Krypton" | Active LTS | 2025-10-28 | 2026-10-20 | 2028-04-30 |
| 26 | Current | 2026-10-28 | 2027-10-20 | 2029-04-30 |

Rationale:

- The prior state shipped `node:26-alpine` in production while CI, `.nvmrc`, and
  `engines` all targeted Node 22 — a Current (non-LTS) runtime that no unit,
  coverage, or audit leg ever ran. A regression that only surfaced on the ship
  major escaped the entire suite, and `engines: ">=22"` failed to pin any major.
- Node 24 is the **active LTS line today** (24 "Krypton", LTS since 2025-10-28,
  supported through EOL 2028-04-30). 26 is still **Current / non-LTS** until it
  promotes on 2026-10-28. Standardizing on the LTS major gives us
  test/prod parity now on a supported line rather than tracking Current.
- Pinning `engines` to `>=24 <25` locks the major so a mismatched local or CI
  Node fails fast instead of silently drifting.
- When 26 promotes to Active LTS (2026-10-28), revisit: bumping the base image,
  `.nvmrc`, `engines`, and CI together (as this change did) is a single
  coordinated PR, and the digest-pinned bases + Dependabot + Trivy gate keep
  patches flowing in the meantime.

## Known-behind dev tooling (no action)

`eslint` 9 (vs 10) and `typescript` 6 (vs 7) are dev-only and gated by
`eslint-config-next` (see the Dependabot ignore rule for eslint majors).
Unblock when `eslint-config-next` supports them.

## Leaflet (web map picker, #48)

**Chosen 2026-07 per the [search & discovery RFC](rfcs/search-discovery-service.md)
§3.3 (owner-approved).** `leaflet@^1.9.4` (BSD-2-Clause) plus `@types/leaflet`
(dev) are the **only** map dependencies — plain Leaflet with a thin React
wrapper (`src/components/LocationPickerMap.tsx`), deliberately **no
react-leaflet** (an extra dependency and render layer for two small picker
mounts is not worth it). Facts: ~148 KB min / ~43 KB gzip JS + ~12 KB / ~2.7 KB
gzip CSS, no API key, works with any tile source. It is dynamically imported
client-side only, so the cost is a lazy chunk loaded exactly when the picker
renders (register wizard profile step, dashboard profile form) — public pages
ship none of it; the profile mini-map is server-rendered `<img>` tiles
(`StaticLocationMap`, zero JS). Tiles come from the OSM standard tile host
(attribution required, host allowed in the CSP `img-src`); if traffic ever
outgrows the OSM tile-usage policy, the URL lives in one place
(`src/lib/geo.ts`) — switch it to MapTiler or self-hosted tiles.
