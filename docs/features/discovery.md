# Discovery


### Provider directory

**`/providers`** (`src/app/providers/page.tsx`, `PAGE_SIZE = 12`) lists
providers from `GET /api/providers`. Signed-in users also fetch
`GET /api/favorites` so saved cards are marked.

**Filters** (`FilterBar`, all pass through to provider-service):

- Free-text search `q` (matches name, category EN/SI labels, and the English
  **and** optional Sinhala headline/bio (#515) so a Sinhala query finds a
  Sinhala-authored pitch).
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
keyboard-hostile (WCAG 3.2.2). Results paginate with prev/next. Ranking over the
matched set is bounded server-side (up to 1000 candidates) and backed by pg_trgm
indexes.

Signed-in customers with at least one primary filter (`q`/`category`/
`district`) active also get a **"Save this search"** affordance under the
filter bar — see [Saved searches & alerts](saved-searches.md) (#516).

Provider cards (`ProviderCard`) show a cover image (provider's own cover →
admin-set category cover image (#436) → placeholder), category, experience,
availability chip ("Available" or
"Away until…"), verified tick, location, headline, rating, "from" price, and an
optional favorite button. The headline (and, on the profile page, the bio)
render the provider's Sinhala variant under the `si` locale when present,
falling back to the English original (#515).

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

### search-service (RFC phase 2 — API live, web still on browse)

The RFC's **search-service** (:4008) is deployed: a derived PostGIS index over
public provider card data serving `GET /api/search/providers` (a superset of
browse — same params, envelope and card DTO, plus `lat`/`lng`/`radiusKm` and
`sort=distance`, with fully DB-side rating filter/sort and no candidate cap)
and `GET /api/search/providers/nearby` (ST_DWithin radius + nearest-first over
pinned providers, `distanceKm` on every card). provider-service pushes index
documents S2S on every indexed write, review-service pushes rating aggregates,
and a daily reindex sweep self-heals drift; `scripts/e2e-smoke.sh`
shadow-compares search against browse for parity. **The web still queries
`/api/providers`** — the browse cut-over plus the map view / "near me" UI is
phase 3 of the [RFC](../rfcs/search-discovery-service.md).

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

