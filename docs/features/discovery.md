# Discovery

### Home page (`/`)

**`src/app/page.tsx`** is the landing surface: a hero with the search console
(`SearchBar` + popular-query chips) on the left and, on the right, an **animated
trade slider** (`HeroSlider`, #447). It's a framed technical plate that
auto-advances through trade photos (mechanic, electrician, plumber, welder,
carpenter, from `public/images/workers/`) with layered on-theme motion: a slow
`.hero-float` drift on the whole plate, a per-slide cross-fade + push-in zoom
over the Ken Burns drift, a brand scan-line wipe, rise-in badge/counter/`Fig.0N`
caption, a breathing active tick and an auto-advance gauge. Controls: prev/next,
a segmented tick selector, arrow-key nav, an explicit pause/play toggle (the
WCAG 2.2.2 stop mechanism) and pause on hover/focus; the advance is
`requestAnimationFrame`-driven so the gauge stays in sync. It honours
`prefers-reduced-motion` (static, manually-navigable) and `preload`s the first
slide (Next 16's replacement for the deprecated `priority`) for LCP; the frame
is a fixed `aspect-[4/5]` so there's no layout shift. Localized EN/SI. Below the hero: the trade registry (category grid), a
trust band, and featured/recent providers. See [DESIGN.md](../DESIGN.md#motion)
for the motion primitives.

### Provider directory

**`/providers`** (`src/app/providers/page.tsx`, `PAGE_SIZE = 12`) lists
providers from **`GET /api/search/providers`** — the
[search & discovery RFC](../rfcs/search-discovery-service.md)'s phase 3
cut-over; same params, envelope and card DTO the old browse served. If
search-service is down the page degrades to the provider-service
`GET /api/providers` browse, which keeps serving the identical envelope
during the transition (RFC §5.2). Signed-in users also fetch
`GET /api/favorites` so saved cards are marked.

**Filters** (`FilterBar`, all pass through to search-service):

- Free-text search `q` (matches name, city, service titles, category EN/SI
  labels, and the English **and** optional Sinhala headline/bio (#515) so a
  Sinhala query finds a Sinhala-authored pitch).
- `category` and `district` selects (25 districts). The district filter is a
  **membership test on the provider's service area** (#502): it matches any
  provider whose `serviceDistricts` set contains the chosen district, not
  only providers based there.
- Price range `priceMin` / `priceMax`.
- Minimum rating `ratingMin` (4+ / 3+ / 2+).
- `availableOnly` toggle.
- **Sort:** recommended (default), highest rated, most reviews, lowest price,
  most experienced, newest.

Text, category, district, rating and price commit together on submit (the
Search button); the availability toggle applies on change; sort commits on
blur. Selects deliberately don't navigate on every `change` — a closed native
select fires `change` on each arrow keypress, which would make them
keyboard-hostile (WCAG 3.2.2). Results paginate with prev/next. Ranking,
rating filters and pagination all run DB-side in search-service's PostGIS
index (no candidate cap), with pg_trgm + tsvector text matching.

Signed-in customers with at least one primary filter (`q`/`category`/
`district`) active also get a **"Save this search"** affordance under the
filter bar — see [Saved searches & alerts](saved-searches.md) (#516).

Provider cards (`ProviderCard`) show a cover image (provider's own cover →
admin-set category cover image (#436) → placeholder), category, experience,
availability chip ("Available" or
"Away until…"), verified tick, location, headline, rating, "from" price, and an
optional favorite button. The headline (and, on the profile page, the bio)
render the provider's Sinhala variant under the `si` locale when present,
falling back to the English original (#515). On geo results the card also
shows the distance from the searched point (`distanceKm`, 1-decimal km).

### Map view & "near me" (#48)

The listing has a **List / Map toggle** (`ProvidersView`, an `aria-pressed`
button group — deliberately not in the URL, so filter and pagination links
behave exactly as before). The list is the default and stays the **primary,
fully accessible representation**; the map is progressive enhancement per the
RFC's a11y contract.

The map view (`ProviderMapView`) queries **`GET
/api/search/providers/nearby`** client-side with the same active filters plus
a center and radius:

- **Center:** the **"Near me"** button uses browser geolocation; denial (or
  no geolocation API) is announced via a live region and falls back to a
  **district select** that centers on the district's static centroid
  (`DISTRICT_CENTROIDS`). When a district filter is already active the map
  auto-centers on it, so it works without granting location access.
- **Radius:** a labelled select (5/10/25/50/100 km, default 25 — the
  service's default; 100 is its cap).
- **Map** (`ProviderMap`): the same client-only Leaflet setup as the location
  picker (dynamic import, `ssr: false`, OSM tiles + attribution, one shared
  tile URL in `src/lib/geo.ts`), drawing the search circle and a pin per
  **pinned** provider in range. Markers are keyboard-focusable (Enter
  activates) with accessible "{name}, {category}, {distance} km" names;
  activating one moves focus to the matching card in the list below. A skip
  link jumps past the map, and every map result also renders as a normal
  provider card (with distance) in that list. The nearby query only returns
  **pinned** providers in range, so pin-less providers appear in neither the
  map nor its list — switch back to the list view (regular search) to see
  them. Result counts, geolocation
  progress and errors are announced (`role="status"` / `role="alert"`, with
  retry).

### Provider profile

**`/providers/[id]`** (`GET /api/providers/:id/full`) renders the public
profile: hero (avatar, category, verified badge, availability, location,
rating), action chips (favorite, share, report), a stats readout, contact links
(a **tap-to-reveal** phone/WhatsApp button plus socials and website), and four
spec sections — **About,
Services, Photos, Reviews** — with an inquiry form in the sticky sidebar.
Phone numbers are withheld from the public payload and fetched on the reveal tap
via a rate-limited endpoint (#64), so crawlers can't harvest the directory's
numbers from page HTML.
Suspended providers 404 for everyone except admins.

When the provider has dropped a **location pin** (#48, geo-capture phase of
the [search & discovery RFC](../rfcs/search-discovery-service.md)), the About
section shows a small static OpenStreetMap mini-map
(`StaticLocationMap` — a server-rendered 3×3 grid of OSM raster tiles with a
CSS pin, zero JS) linking to the full map on openstreetmap.org, with the
required OSM attribution. The pin is captured with a Leaflet picker in the
register wizard and the dashboard profile form (`LocationPicker` — optional,
pre-centered on the district centroid, with manual coordinate inputs as the
keyboard path); coordinates are validated to a Sri Lanka bounding box and are
only ever real pins — district centroids are never substituted.

### search-service (RFC phases 2–3 — API live, web cut over)

The RFC's **search-service** (:4008) is deployed: a derived PostGIS index over
public provider card data serving `GET /api/search/providers` (a superset of
browse — same params, envelope and card DTO, plus `lat`/`lng`/`radiusKm` and
`sort=distance`, with fully DB-side rating filter/sort and no candidate cap)
and `GET /api/search/providers/nearby` (ST_DWithin radius + nearest-first over
pinned providers, `distanceKm` on every card). provider-service pushes index
documents S2S on every indexed write, review-service pushes rating aggregates,
and a daily reindex sweep self-heals drift; `scripts/e2e-smoke.sh`
shadow-compares search against browse for parity. **The web now queries
`/api/search/providers`** (phase 3); the provider-service `GET /api/providers`
browse route deliberately stays at parity until the cut-over has soaked — the
homepage "newest" strip and the listing's outage fallback still call it, and
the e2e parity check compares against it. Slimming it to the `ids=` favorites
path is the RFC's post-soak cleanup (§5.2).

### Open Graph images

**`/providers/[id]/opengraph-image`** generates a 1200×630 PNG via `next/og`
from `GET /api/providers/:id/card`: Baas.lk badge, provider name, English
category label, city/district, and a rating footer. (Satori ships a Latin font
only, so the category label is rendered in English even on `/si`.)

### Structured data

The homepage embeds `WebSite` (with a `SearchAction` into `/providers?q=…`)
and `Organization` JSON-LD (#514). Provider profiles embed a `LocalBusiness`
node (`providerJsonLd` in `src/lib/seo.ts`, #379): name, bilingual headline as
the description, city/district address, category, avatar image, and an
`AggregateRating` when reviews exist (matching the hero's all-reviews figures).
Text follows the rendered locale; `url` is the locale's canonical while `@id`
stays pinned to the English URL so both language pages describe one entity.
Serialization escapes `<` against JSON-LD injection (`src/components/JsonLd.tsx`).

---

