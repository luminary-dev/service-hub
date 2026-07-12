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
a segmented tick selector, arrow-key nav, and pause on hover/focus; the advance
is `requestAnimationFrame`-driven so the gauge stays in sync. It honours
`prefers-reduced-motion` (static, manually-navigable) and keeps the first slide
`priority` for LCP; the frame is a fixed `aspect-[4/5]` so there's no layout
shift. Localized EN/SI. Below the hero: the trade registry (category grid), a
trust band, and featured/recent providers. See [DESIGN.md](../DESIGN.md#motion)
for the motion primitives.

### Provider directory

**`/providers`** (`src/app/providers/page.tsx`, `PAGE_SIZE = 12`) lists
providers from `GET /api/providers`. Signed-in users also fetch
`GET /api/favorites` so saved cards are marked.

**Filters** (`FilterBar`, all pass through to provider-service):

- Free-text search `q` (matches name and category EN/SI labels).
- `category` and `district` selects (25 districts).
- Price range `priceMin` / `priceMax`.
- Minimum rating `ratingMin` (4+ / 3+ / 2+).
- `availableOnly` toggle.
- **Sort:** recommended (default), highest rated, most reviews, lowest price,
  most experienced, newest.

Category/district/rating/availability/sort apply on change; text and price
apply on submit. Results paginate with prev/next. Ranking over the matched set
is bounded server-side (up to 1000 candidates) and backed by pg_trgm indexes.

Provider cards (`ProviderCard`) show a cover image (provider's own cover →
admin-set category cover image (#436) → placeholder), category, experience,
availability chip ("Available" or
"Away until…"), verified tick, location, headline, rating, "from" price, and an
optional favorite button.

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

### Open Graph images

**`/providers/[id]/opengraph-image`** generates a 1200×630 PNG via `next/og`
from `GET /api/providers/:id/card`: Baas.lk badge, provider name, English
category label, city/district, and a rating footer. (Satori ships a Latin font
only, so the category label is rendered in English even on `/si`.)

---

