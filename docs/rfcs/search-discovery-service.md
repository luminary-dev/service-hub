# RFC: Search & discovery service (geo-aware provider search)

- **Status:** Draft — awaiting owner sign-off on the third-party choices in §3.3
- **Refs:** #48 (map view + distance-based discovery), #2 (Tamil — design for, don't block on)
- **Scope:** Stage-2 Track 3. A new `search-service` owning provider search queries and
  geo/distance discovery. Provider data source of truth **stays in provider-service**.

## 1. Problem

Provider discovery today is `GET /api/providers` in
`services/provider-service/src/routes/providers.ts`, whose where-clause is built by
`buildBrowseWhere` in `services/provider-service/src/lib/search.ts`: ILIKE `contains`
over headline/bio/headlineSi/bioSi/city/contactName/service titles (pg_trgm GIN-backed,
migration `20260704210000_search_trgm`), category + district filters (district is a
membership test on the `serviceDistricts String[]` set since #502/#610), Decimal price
range (#609), and effective availability (#49). Two structural limits:

1. **Ranking and rating filters run in memory.** Ratings live in review-service, so the
   route loads up to `MAX_BROWSE_CANDIDATES = 1000` rows, hydrates ratings over S2S,
   then filters/sorts/paginates in process (`providers.ts` lines 230–280). Past that cap,
   results are silently incomplete.
2. **No location.** `Provider` has free-text `city` + `district` only — no coordinates,
   so no map view, no "nearest first", no radius search. #48 asks for exactly that, and
   Sri Lankan addresses are informal enough that address-string geocoding alone is
   unreliable; districts (25 of them) are the only trustworthy structure we have today.

## 2. Proposal in one paragraph

Add `search-service` (:4008, Hono + Prisma, its own `search_db`) that owns a **derived,
rebuildable index** of public provider card data — the fields `buildBrowseWhere` touches,
plus lat/lng and denormalized rating aggregates — in Postgres with **PostGIS**. Provider
writes push index documents S2S (the avatar-mirror pattern, best-effort), and a periodic
full-reindex sweep self-heals drift. The gateway grows `/api/search/providers` (superset
of today's browse params, fully DB-side ranking) and `/api/search/providers/nearby`
(ST_DWithin radius + nearest-N). `/api/providers` browse stays in provider-service until
the web migrates. District remains first-class everywhere; geo is additive.

### Why Postgres + PostGIS, not Meilisearch/Typesense

- **Infra cost.** Prod is a single VPS running 10 containers (`docker-compose.prod.yml`).
  An external engine is another always-resident memory footprint, another backup target
  (outside `scripts/backup-dbs.sh`), another upgrade/security surface — for a corpus that
  is thousands of rows, not millions.
- **Geo + relational filters in one query.** `ST_DWithin` + `serviceDistricts @> …` +
  price/rating/availability predicates compose in one indexed SQL statement. External
  engines do geo, but replicating the district-array + Decimal-price semantics means
  maintaining a second filter DSL.
- **We already lean on Postgres text search.** pg_trgm is in production; tsvector FTS is
  the documented upgrade path in `lib/search.ts`'s header comment. PostGIS is the same
  move: one trusted cluster, per-service DBs (#612), zero new stateful systems.
- **Revisit trigger:** if we ever need typo-tolerant instant search at >100k documents or
  faceted counts at scale, revisit Meilisearch; the index is rebuildable, so swapping the
  engine later is a contained change behind the same `/api/search/*` contract.

### Compose DB image implication (PostGIS)

Dev runs `postgres:16-alpine`, prod a pinned digest of the same. PostGIS is **not** a
trusted extension: `CREATE EXTENSION postgis` needs superuser, and since #612 each prod
service connects as a non-superuser role that merely owns its DB (`deploy/postgres-init.sh`).
Plan:

- Swap the cluster image to **`postgis/postgis:16-3.5-alpine`** in both compose files
  (prod pinned by digest, dependabot comment updated). Same PG16 data-dir format — the
  existing `pgdata` volume mounts unchanged; the image only adds extension packages.
- **Extension creation happens at superuser bootstrap, not in service migrations:** add
  `search_db` + `CREATE EXTENSION postgis` (executed in `search_db`) to `scripts/init-db.sql`
  (dev) and `deploy/postgres-init.sh` (fresh prod volume). For the existing prod volume
  (initdb never re-runs), a one-off idempotent script in the `deploy/migrate-db-roles.sh`
  mold creates the role/DB/extension; documented in DEPLOYMENT.md rollout order.
- search-service's first hand-written migration still includes
  `CREATE EXTENSION IF NOT EXISTS postgis;` — a no-op where bootstrap already created it
  (prod), and the working path on dev where services connect as superuser.
- Rejected alternative: `earthdistance`/haversine on plain columns avoids the image swap
  but gives up geography-aware indexes and `ST_DWithin`; the image swap is low-risk and
  buys the standard toolkit.

## 3. Geo model

### 3.1 Capture: map-pin picker, not address geocoding

`Provider` (provider-service schema — **source of truth**) gains nullable
`latitude`/`longitude` (`Decimal(9,6)`). Captured via a **Leaflet map-pin picker**:

- In the register wizard's location step (`src/app/register/provider/ProviderRegisterForm.tsx`)
  and the dashboard profile form, pre-centered on the chosen district's centroid (a
  static 25-district centroid table shipped in the web app — no API needed).
- Optional "find my area" assist: forward-geocode the free-text `city` via Nominatim to
  re-center the map — **assist only, never authoritative**; the provider confirms by
  dropping/adjusting the pin. This is the right call for Sri Lanka: informal addresses
  ("near the temple, Pannipitiya") geocode poorly, but people can point at their town.
- The pin is optional. Unpinned providers keep full district-based visibility; they are
  simply absent from radius results (with a dashboard nudge to add a pin). District
  centroids are **not** silently substituted as fake coordinates — a 40 km-wide district
  centroid masquerading as a location produces wrong "2 km away" claims.

### 3.2 Queries

- Index column: `location geography(Point, 4326)` + GiST index.
- Radius: `ST_DWithin(location, ST_MakePoint($lng,$lat)::geography, $radius_m)` — index-backed.
- Nearest-N: `ORDER BY location <-> ST_MakePoint($lng,$lat)::geography LIMIT n` (KNN GiST).
- Distance returned per card as `distanceKm` (1-decimal, from `ST_Distance`).
- District stays first-class: every geo query can also carry `district`/`category`/price/
  rating filters; the non-geo `/api/search/providers` needs no coordinates at all.

### 3.3 Third-party choices — **owner must confirm**

| Concern | Recommended | Alternative | Why |
|---|---|---|---|
| Web map library | **Leaflet** (+ react-leaflet, client-only) | Google Maps JS SDK | Free, no API key, small, works with any tile source |
| Map tiles | **OpenStreetMap standard tiles** (attribution required) | MapTiler free tier (key), self-hosted tiles, Google | Zero cost/keys at our traffic; OSM tile-usage policy is fine for a low-traffic site — if traffic grows, switch the tile URL to MapTiler/self-hosted (one-line change) |
| Geocoding (assist only) | **Nominatim public API** (1 req/s, attribution) | Google Geocoding (paid, key) | Used only for the optional map-recenter assist, called client-side |

Tiles and Nominatim are fetched **by the browser**, so the prod `egress`/`backend`
network split (#612) is untouched — no service container needs new internet access.
Only web CSP/img-src needs the tile host added.

## 4. Index & sync

### 4.1 What gets indexed (`ProviderIndex`, one row per provider)

Everything the query plane needs, nothing more (no PII — no phone/email columns):
`providerId` (pk), `userId`, `contactName`, `category`, `headline`, `bio`, `headlineSi`,
`bioSi`, `city`, `district`, `serviceDistricts text[]` (GIN), `serviceTitles text[]`
(flattened, for the free-text OR), `minPrice Decimal` (cheapest service — today's
`fromPrice`), `priceRange` (min/max across services for the priceMin/priceMax semantics),
`available`, `awayUntil`, `verificationStatus`, `experience`, `createdAt`, `updatedAt`,
`location geography NULL`, **rating aggregates** `ratingAvg`/`ratingCount` (owned by
review-service, denormalized here), plus generated tsvector columns (§6). Suspended
providers are **deleted from the index**, not flagged — the index only ever contains
publicly visible rows, so no query can leak a hidden profile.

Search returns ranked **ids + distance + total**; card DTOs are hydrated from
provider-service via a new batched `GET /internal/providers/cards?ids=` (the existing
card include in `providers.ts`), keeping display data single-sourced and the index lean.
Ratings on cards keep coming from the index (already there for ranking).

### 4.2 Sync: S2S push on write + sweep self-heal

**Push** (the #434 avatar-mirror / #516 alert pattern — fire-and-forget `void`, logged,
never failing the caller's write): provider-service posts the **full index document**
(idempotent upsert, last-write-wins on `updatedAt`) to search-service
`POST /internal/index/providers` (or `DELETE …/:id`) from every write that changes an
indexed field:

- `POST /internal/providers` (create — `routes/internal.ts`, next to the existing
  `void notifySavedSearchMatches(...)` call at line ~155)
- `PUT /api/provider/profile` (`routes/provider.ts:175` — covers headline/bio/SI variants,
  district/serviceDistricts, city, away mode, and the new lat/lng)
- Service CRUD (`routes/provider.ts:248/282/320` — titles + prices)
- Admin suspend/unsuspend + verification decisions (`routes/admin.ts:225/278/312/353`)
- Internal deactivate/reactivate (`routes/internal.ts` by-user endpoints)
- Contact-name mirror (`POST /internal/providers/contact` — contactName is indexed)
- Erase (`POST /internal/users/:id/erase` → index delete)

**Ratings**: review-service pushes `{providerId, ratingAvg, ratingCount}` to
`POST /internal/index/ratings` after review create/delete/moderation (same best-effort
pattern), so rating sort/filter finally happens DB-side and the
`MAX_BROWSE_CANDIDATES` cap dies with the migration.

**Sweep** (self-heal): `POST /internal/maintenance/reindex` on search-service walks a new
paginated `GET /internal/providers/export?cursor=` on provider-service (+ the existing
`GET /internal/ratings` batch on review-service), upserts everything, deletes index rows
absent from the export. Ops-cron triggered like the existing `sweep-orphans`
(`docs/OPERATIONS.md`), daily.

**Staleness tolerance:** push makes changes visible in seconds; a dropped push is bounded
by the sweep (≤24 h). Acceptable for a public directory; anything transactional (alerts —
§5.3) deliberately does **not** read the index.

## 5. API & transition

### 5.1 Endpoints (search-service, via gateway)

- `GET /api/search/providers` — superset of today's browse: `q, category, district,
  priceMin, priceMax, ratingMin, availableOnly, sort, page, pageSize` **plus**
  `lat, lng, radiusKm, sort=distance`. Same response envelope
  `{ providers, total, page, pageSize }` with the same card DTO (+ `distanceKm` when geo
  params are present) so the web swap is mechanical.
- `GET /api/search/providers/nearby?lat=&lng=&radiusKm=&category=…` — radius +
  nearest-first, capped `radiusKm` (default 25, max 100), pinned providers only.

### 5.2 Gateway wiring & transition

`services/api-gateway/src/lib/routes.ts`: add `"search"` to `ServiceName`, route
`/api/search/*` → `SEARCH_SERVICE_URL` (:4008), env in both compose files' `x-service-env`
and `docs/architecture/environment.md`. **`/api/providers` browse stays on
provider-service unchanged** until the web has migrated to `/api/search/providers` and it
has soaked; then the provider-service browse route slims to the `ids=` favorites path and
detail routes (which stay — they're profile reads, not search). No URL ever breaks; the
gateway's routing table is the single cut-over point. If search-service is down, the map
view degrades to the list and (during transition) `/api/providers` still serves.

### 5.3 Saved-search alert matching: stays in provider-service (short-term)

The #516/#611 pipeline (`services/provider-service/src/lib/saved-search-alerts.ts`)
evaluates the **just-committed** provider row via `buildBrowseWhere` pinned to the new id
(line 55), fanning out to identity's `/internal/saved-searches/candidates` and
notification. It must **not** move to the search index now: the index push is async, so a
freshly registered provider may not be indexed when the alert fires — matching against
the index would silently drop exactly the "new provider" alerts the feature exists for,
and it would put a brand-new service on a registration-adjacent path. `buildBrowseWhere`
therefore stays in provider-service as the alert-matching oracle. Once `/api/search` has
fully replaced browse, a follow-up can expose `POST /internal/search/match` that evaluates
a candidate **document from the request body** (not the index) with the search query
parser — removing the duplicate matching logic without the staleness race. Until then the
two implementations share one contract, covered by the existing `search.test.ts` +
`saved-search-alerts.test.ts`.

## 6. Multilingual readiness (si now, ta later)

Provider free text is English-required with optional Sinhala variants (#515:
`headlineSi`/`bioSi`); category labels are `labelEn`/`labelSi`, and browse resolves query
text against both (`providers.ts` category-slug lookup). The index makes languages
**per-column, not per-schema**:

- `tsv_en tsvector GENERATED … ('english', headline‖bio‖city‖contactName‖serviceTitles)` —
  stemming + ranking for English.
- `tsv_si tsvector GENERATED … ('simple', headlineSi‖bioSi)` — Postgres has no Sinhala
  stemmer; `simple` tokenizes on whitespace/punctuation, which is correct-enough for
  Sinhala, and **pg_trgm indexes on the raw columns stay** for substring/typo matching
  (today's behavior is preserved as the fallback OR-arm).
- Query = `websearch_to_tsquery` against both vectors OR trigram match, ranked by
  `ts_rank` then rating — one parser, language-agnostic.
- **Tamil (#2, uncertain):** when `headlineTa`/`bioTa`/`labelTa` land, add one migration:
  the columns + `tsv_ta` (`simple` config, same as Sinhala — Tamil also lacks a built-in
  stemmer) + trgm index, and append one arm to the query builder. No schema redesign, no
  API change (`q` stays a single opaque string). Nothing in phases 1–3 blocks on this.

## 7. Delivery plan

**New package** `services/search-service` per `docs/service-template/`: Hono + Prisma,
port 4008, `lib/http.ts` internal-secret middleware, hand-written migrations,
`start:migrate`. Repo integration (each per existing patterns):

- **Compose:** service in both files; prod joins `backend` only (no egress — it calls no
  external APIs); `search_db` bootstrap as in §2; `SEARCH_DB_PASSWORD` in
  `.env.prod.example` + compose.prod; postgres image → `postgis/postgis:16-3.5-alpine`.
- **CI:** add `search-service` to both matrices in `.github/workflows/ci.yml` (fast +
  coverage) and the image-build list in `deploy.yml`.
- **Backups:** `search_db` deliberately **excluded** from `scripts/backup-dbs.sh` — the
  index is derived and rebuilt by the sweep; document in `docs/BACKUPS.md`.
- **Mirror:** append to `SERVICES` in `scripts/sync-service-repos.sh`; create the
  read-only `luminary-dev/service-hub-search-service` repo.
- **Docs (same PRs as code):** `docs/ARCHITECTURE.md` + `architecture/environment.md` +
  `architecture/gateway.md`, `docs/API.md` + `api/public.md`/`api/internal.md`,
  `features/discovery.md`, `DEPLOYMENT.md` (image swap + role bootstrap), `SUMMARY.md`.

**Web map view:** Leaflet client-only (dynamic import, no SSR — check
`node_modules/next/dist/docs/` per AGENTS.md before implementing), as a list/map toggle on
`/providers` plus "near me" (browser geolocation; denial falls back to the district
picker). EN/SI strings via `src/lib/i18n.ts`. **A11y:** the list remains the primary,
fully accessible representation — the map is progressive enhancement; markers get
keyboard focus + accessible names ("{name}, {category}, {distance} km"), a skip link
bypasses the map, and every map result also appears in the adjacent list (axe coverage per
#602's pattern).

### Phases

1. **Geo capture (no new service):** lat/lng columns + pin picker + profile-page mini-map;
   dashboard nudge to backfill pins. Ships value alone (#48's first half).
2. **search-service:** package + compose/CI/mirror wiring + index + push/sweep +
   `/api/search/providers` at parity + `/nearby`. Shadow-compare against `/api/providers`
   output in e2e (`scripts/e2e-smoke.sh` gains a parity check).
3. **Web cut-over:** browse → `/api/search/providers`; map view + near-me; retire the
   in-memory rating filter/sort and `MAX_BROWSE_CANDIDATES` from provider-service.
4. **Later:** `/internal/search/match` for alert matching (§5.3), Tamil columns when #2
   lands, engine revisit only if scale demands (§2).

## 8. Risks

| Risk | Mitigation |
|---|---|
| Postgres image swap on the live prod volume | Same PG16 major (data dir compatible); PostGIS only exists in `search_db`, so rollback to `postgres:16-alpine` stays possible until phase 2 ships; rehearse on a restored backup per `docs/BACKUPS.md` |
| Index drift / missed pushes | Full document upserts (idempotent) + daily sweep + a `/internal/index/stats` count-vs-source metric in the ops runbook |
| Sparse pin coverage at launch | District search remains primary; nearby is explicitly "providers with a pin"; dashboard nudge + register-wizard capture grow coverage |
| OSM tile-usage policy at higher traffic | Attribution + browser caching now; tile URL is one config — switch to MapTiler key or self-hosted tiles later (owner decision §3.3) |
| Another container on one VPS | Node service ~100 MB RSS, shares the existing cluster; no Redis/queue added |
| Leaking hidden profiles via the index | Suspended/erased rows are deleted from the index (push + sweep both enforce); index stores no contact PII at all |
| New service on the read path during transition | Gateway keeps `/api/providers` on provider-service until soak completes; web falls back to list view if `/api/search` errors |
