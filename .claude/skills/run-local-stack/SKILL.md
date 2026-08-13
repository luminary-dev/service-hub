---
name: run-local-stack
description: Launch and drive the Baas.lk service-hub app locally (Next.js web + 10 backend services + Postgres/Redis, optional observability). Use when asked to run, start, serve, or screenshot-verify the app on this machine. Prefers the Docker-based scripts/run/* launchers.
---

# Running service-hub locally

The verified path is the **Docker-based launchers in `scripts/run/`** (not the
host `dev-all.sh`). Containers are owned by the Docker daemon, so they survive
the shell — and in agent/CI contexts they survive background-task reaping,
which kills host `npm run dev`/`dev-all.sh` processes (its `EXIT` trap then
tears down every child service).

## Launch (pick the scope)

```bash
./scripts/run/everything.sh          # full app + observability + all profiles, seeded
./scripts/run/app.sh                 # all 10 services + web + infra, seeded (no monitoring)
./scripts/run/frontend.sh            # only the Next.js UI (:3000), no backend
./scripts/run/backend.sh <service>   # one service + its DB (e.g. provider, api-gateway)
./scripts/run/observability.sh       # only Grafana/Prometheus/Loki/Tempo
./scripts/run/stop.sh [--wipe]       # stop (│ --wipe also deletes the DB volume)
```

`app.sh` and `everything.sh` seed demo data on first run (idempotent). Pass
`--no-seed` (or `SEED=0`) to bring the stack up schema-only with no demo data.
To seed manually later: `./scripts/run/seed.sh` (`--force` to reseed).

First `everything.sh` is a big build/pull (10 service images + the observability
suite) — several minutes. Watch real progress with `docker compose ps`, not the
build log (buildkit output buffers).

## Drive it — don't just launch

Verify the app actually serves (use an absolute `/usr/bin/curl`; a bare `curl`
can hit a PATH quirk in some non-interactive shells here):

```bash
/usr/bin/curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
/usr/bin/curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/providers?limit=1"
# near-me geo (search-service + PostGIS), Colombo:
/usr/bin/curl -s "http://localhost:4000/api/search/providers?lat=6.9271&lng=79.8612&radiusKm=25&limit=1"
```

All should be `200` with real seeded data. For UI work, open
http://localhost:3000 in a browser and screenshot — a blank frame means the
backend isn't up (run `app.sh`, not `frontend.sh`).

Demo accounts (password `password123`): `admin@baas.lk` (ADMIN),
`support@baas.lk` (SUPPORT), plus seeded providers/customers.

## Gotchas already handled by the scripts

- **Apple Silicon / arm64:** `postgis/postgis:16-3.5-alpine` has no arm64
  manifest, so a bare `docker compose up postgres` fails with
  *"no matching manifest for linux/arm64/v8"*. `scripts/run/_common.sh` detects
  arm64 and layers in `scripts/run/compose.arm64.yml`, pinning **only Postgres**
  to `linux/amd64` (Rosetta). No effect on amd64 hosts.
- **Seeding vs migrations:** container images run `NODE_ENV=production`.
  Migrations auto-apply via each service's `start:migrate`, but the demo seed
  must be opted into (`SEED_DEMO_DATA=true`) — `seed.sh` does this and then
  rebuilds the search index via the reindex endpoint.
- **`prom-client` (host path only):** if you ever fall back to `dev-all.sh`,
  services can crash on `Cannot find module 'prom-client'` when a service's
  `node_modules` is stale — run `npm install` in that service. The Docker path
  builds fresh images, so it doesn't hit this.

## Ports (everything.sh)

app :3000 · gateway :4000 · services :4001–:4009 · Grafana :3001 ·
Prometheus :9090 · Loki :3100 · Tempo :3200 · Unleash :4242 · GlitchTip :8000 ·
Mailpit :8025.

See `scripts/run/README.md` for the full table.
