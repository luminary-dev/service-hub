# search-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/search-service`](https://github.com/luminary-dev/service-hub/tree/main/services/search-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

Owns provider search queries and geo/distance discovery for Service Hub (port
**4008**, database `search_db` — Postgres with **PostGIS**). It holds a
**derived, rebuildable index** of public provider card data
(`docs/rfcs/search-discovery-service.md`): the fields provider-service's browse
where-clause touches, plus a `geography(Point,4326)` location generated from
the provider's optional map pin (#48) and denormalized rating aggregates from
review-service — so rating filter/sort finally run DB-side. provider-service
stays the **source of truth**: it pushes full index documents S2S on every
indexed write (best-effort, fire-and-forget), review-service pushes rating
patches, and a daily reindex sweep self-heals drift. Suspended/erased providers
are **deleted** from the index (never flagged), so no query can leak a hidden
profile; no contact PII is stored at all. Reached only through the api-gateway;
every request except `/healthz` carries `x-internal-secret`.

## Endpoints

### Public (via gateway)

- `GET /api/search/providers` — superset of provider-service's browse: `q`,
  `category`, `district`, `priceMin`/`priceMax`, `ratingMin`, `availableOnly`,
  `sort`, `page`/`pageSize` **plus** `lat`/`lng`/`radiusKm` and
  `sort=distance`. Same `{ providers, total, page, pageSize }` envelope and
  card DTO as `GET /api/providers` (+ `distanceKm` when geo params are
  present); cards are hydrated from provider-service so display data stays
  single-sourced.
- `GET /api/search/providers/nearby?lat=&lng=&radiusKm=` — radius
  (`ST_DWithin`, default 25 km, max 100) + nearest-first (KNN), pinned
  providers only; accepts the same relational filters.

### Internal (S2S)

- `PUT /internal/search/providers/:id` — full-document upsert (idempotent,
  last-write-wins on the source `updatedAt`). Pushed by provider-service.
- `DELETE /internal/search/providers/:id` — remove on suspend/deactivate/erase.
- `POST /internal/search/ratings` — `{ providerId, ratingAvg, ratingCount }`
  patch. Pushed by review-service after review create/edit/moderation/erase.
- `POST /internal/search/reindex` — full sweep: walks provider-service's
  `/internal/providers/export`, refreshes ratings, deletes rows absent from the
  export. Ops-cron daily (see `docs/OPERATIONS.md`).
- `GET /internal/search/stats` — `{ indexed, pinned }` drift metric.

`GET /healthz` is unauthenticated (checks Postgres; compose healthchecks).

## Data ownership (`prisma/schema.prisma`)

- **ProviderIndex** — one row per publicly visible provider: browse fields,
  served-district set, service titles/prices, generated
  `location geography(Point,4326)` + `tsv_en`/`tsv_si` tsvectors ('english'
  config for EN, 'simple' for SI — Postgres has no Sinhala stemmer), rating
  aggregates. **Derived data** — rebuilt entirely by the reindex sweep, so
  `search_db` is deliberately excluded from backups (`docs/BACKUPS.md`).

The 0_init migration needs the **postgis** extension (not trusted → created by
the superuser bootstrap in prod: `deploy/postgres-init.sh` fresh volume /
`deploy/migrate-db-roles.sh` existing volume; dev connects as the superuser and
creates it itself) and **pg_trgm** (trusted).

## Environment

| var | default | purpose |
|---|---|---|
| `PORT` | `4008` | listen port |
| `DATABASE_URL` | — | Postgres (`search_db`, PostGIS image) |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (required in production) | S2S auth |
| `PROVIDER_SERVICE_URL` | `http://localhost:4002` | card hydration, category labels, reindex export |
| `REVIEW_SERVICE_URL` | `http://localhost:4003` | rating aggregates for the reindex sweep |

## Gateway / S2S model

Only the api-gateway is public. Identity rides behind `x-internal-secret` via
gateway-forwarded `x-user-id` / `x-user-role` / `x-user-name`. Peer
dependencies: provider-service (card DTO hydration — the one read this service
can't degrade around, so a hydration outage returns 503; category-label
matching and the reindex export), review-service (ratings batch for the
sweep). During the transition the web keeps using `/api/providers` (browse
stays on provider-service), so a search outage degrades to the existing list.

## Development

```sh
cp .env.example .env
npm install
npm run db:migrate   # apply migrations to search_db (needs the PostGIS image)
npm run dev
```

The index starts empty — populate it from a seeded stack with
`curl -X POST -H "x-internal-secret: dev-internal-secret" localhost:4008/internal/search/reindex`.

Checks: `npm run typecheck`, `npm test`, `npm run build`.
