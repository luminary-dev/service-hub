# Discovery


### Provider directory

**`/providers`** (`src/app/providers/page.tsx`, `PAGE_SIZE = 12`) lists
providers from `GET /api/providers`. Signed-in users also fetch
`GET /api/favorites` so saved cards are marked.

**Filters** (`FilterBar`, all pass through to provider-service):

- Free-text search `q` (matches name, category EN/SI labels, and the English
  **and** optional Sinhala headline/bio (#515) so a Sinhala query finds a
  Sinhala-authored pitch).
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

### Open Graph images

**`/providers/[id]/opengraph-image`** generates a 1200×630 PNG via `next/og`
from `GET /api/providers/:id/card`: Baas.lk badge, provider name, English
category label, city/district, and a rating footer. (Satori ships a Latin font
only, so the category label is rendered in English even on `/si`.)

---

