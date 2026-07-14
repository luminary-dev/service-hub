# Worker & hero photography

These images are **AI-generated** with OpenAI `gpt-image-2`
(branch `feat/ai-trade-imagery`, `-2`/`-3` variants and the seed-data expansion
under `feat/seed-data-expansion` — see #632) as representative Sri Lankan
trade photography. They carry no third-party licensing or attribution
requirements and can be regenerated at any time. Exported as JPEG
(quality ~82 for the originals; the #632 batch used `quality: "medium"`).

Consistent style prompt: *photorealistic documentary photograph, Sri Lankan
tradesperson working on location in Sri Lanka, natural daylight, candid and
authentic, no text/watermark/logos.*

- **Category covers** — `<slug>-1|2|3.jpg`, **landscape 1536×1024** (the card
  cover is a wide banner). Three variants per category so same-trade providers
  don't share one cover; `ProviderCard` picks one deterministically per
  provider id. All 16 slugs now have all three variants: `mechanic`,
  `electrician`, `plumber`, `carpenter`, `mason`, `painter`, `welder`,
  `roofer`, `garden-designer`, `ac-repair`, `appliance-repair`, `tile-layer`,
  `cctv-security`, `pest-control`, `cleaning`, `movers`.
- **Heroes** — `hero-tea`, `hero-site` are landscape 1536×1024; `hero-worker2`
  is **portrait 1024×1536** (it fills the homepage's 4:5 framed plate, so a
  portrait source keeps it sharp under the ken-burns zoom).

## Seed-data expansion (#632)

Additional AI-generated images under `public/uploads/seed/`, used by the
provider/review/identity seed scripts (not by admin-uploaded content, which
still goes through media-service):

- `avatars/<providerId>.jpg` — one headshot per seeded provider (all 50),
  square 1024×1024.
- `avatars/customer-pool-01..10.jpg` — a 10-image pool reused cyclically
  across the 30 seeded customers (lower-visibility than provider avatars, so
  not uniquely generated per person).
- `covers/<providerId>.jpg` — distinct cover-photo overrides for 5 providers,
  landscape 1536×1024, to demo `Provider.coverPhoto` winning over the
  category-image fallback.
- `pool/<slug>-a|b|c|d.jpg` — a 4-image work-photo pool per category (64
  total), assigned across the 44 new providers so photos stay
  category-appropriate without one unique shot per provider.
- `review-pool/review-01..24.jpg` — a 24-image pool of generic
  "completed work" shots, square 1024×1024, reused across the ~50 reviews
  that carry photos.
- `verification/nic-pool-01..06.jpg` — a 6-image pool of generic, blank
  placeholder ID cards (no real or simulated personal information), square
  1024×1024, reused across the 32 seeded providers with a `VerificationDocument`.

> Swap for authentic on-the-ground photography whenever it's available — real
> providers and jobs are always preferable to generated stand-ins.
