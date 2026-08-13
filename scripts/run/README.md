# `scripts/run/` — local launchers

Granular, Docker-based launchers for running the stack in pieces. They all wrap
`docker compose` (see `docker-compose.yml`), so what they start is owned by the
Docker daemon and survives closing the terminal.

Why Docker and not the host `dev-all.sh`? Containers persist independently of
the shell that started them, the observability stack is Docker-only anyway, and
this sidesteps the arm64 Postgres gotcha below in one place.

## Scripts

| Script | Starts | URL(s) |
| --- | --- | --- |
| `frontend.sh` | web only (`--no-deps`) | http://localhost:3000 |
| `backend.sh <service>` | one backend service + Postgres/pgbouncer/redis | e.g. gateway :4000 |
| `observability.sh` | Prometheus, Grafana, Loki, Alloy, exporters, Tempo, OTel | Grafana :3001 |
| `app.sh [--no-seed]` | all 10 services + web + infra (+ seed on first run) | app :3000, gateway :4000 |
| `everything.sh [--no-seed]` | the whole compose file, all profiles (+ seed on first run) | see below |
| `seed.sh [--force]` | demo data + search reindex (idempotent) | — |
| `stop.sh [--wipe]` | stop all (`--wipe` also deletes volumes) | — |

`backend.sh` takes a short or full name: `provider`, `provider-service`,
`api-gateway`. Run it with no args to list the valid services.

## Examples

```bash
./scripts/run/everything.sh          # the full stack + observability, seeded
./scripts/run/everything.sh --no-seed # full stack, schema only (no demo data)
./scripts/run/app.sh                 # just the app (no monitoring), seeded
./scripts/run/app.sh --no-seed       # just the app, schema only (no demo data)
./scripts/run/frontend.sh            # only the Next.js UI
./scripts/run/backend.sh provider    # only provider-service (+ its DB)
./scripts/run/observability.sh       # only Grafana/Prometheus/Loki/Tempo
./scripts/run/stop.sh                # stop, keep data
./scripts/run/stop.sh --wipe         # stop and wipe the DB
```

Seeding: `app.sh`/`everything.sh` seed demo data on first run (idempotent).
Pass `--no-seed` (or set `SEED=0`) to bring the stack up **schema-only** — the
migrations still apply, there's just no demo data. Seed later any time with
`./scripts/run/seed.sh`.

Everything-at-once URLs: app :3000 · gateway :4000 · Grafana :3001 ·
Prometheus :9090 · Loki :3100 · Tempo :3200 · Unleash :4242 · GlitchTip :8000 ·
Mailpit :8025.

Demo accounts (password `password123`): `admin@baas.lk` (ADMIN),
`support@baas.lk` (SUPPORT), plus seeded providers and customers.

## Notes / gotchas

- **Apple Silicon (arm64):** the pinned `postgis/postgis:16-3.5-alpine` image
  has no arm64 manifest. `_common.sh` detects arm64 and layers in
  `compose.arm64.yml`, which pins **only Postgres** to `linux/amd64` (Rosetta
  emulation). No effect on amd64 hosts, so it's safe for the deploy servers.
- **Secrets:** `AUTH_SECRET` and `INTERNAL_API_SECRET` default to dev values;
  export your own to override. `AUTH_SECRET` must match between `web` and
  `identity-service` for session verification.
- **Data persists** in the `pgdata` volume across `stop.sh`/restarts; only
  `stop.sh --wipe` clears it. After a wipe, the next `app.sh`/`everything.sh`
  reseeds automatically.
- **First-run migrations** apply automatically inside the containers
  (`start:migrate`); only seeding needs the explicit opt-in that `seed.sh`
  handles.
