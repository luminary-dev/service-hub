# Design system

The web app's visual language is a **blueprint / technical-drafting** look —
safety-orange accents on cool steel neutrals, mono spec labels, graph-paper
bands and drafting corner brackets. All of it is defined in one place,
`src/app/globals.css` (Tailwind CSS 4, `@theme`), and consumed through semantic
tokens so light and dark themes flip at the token layer. This doc is a
reference for those tokens and the shared primitives; treat `globals.css` as the
source of truth.

## Color tokens

Colors are OKLCH ramps declared under `@theme`, exposed to Tailwind as
`brand-*` and `ink-*` utility colors (`bg-brand-700`, `text-ink-900`, …).

### Brand — safety orange (hi-vis)

A 50–900 ramp. Roles (from the code comments):

- **800** — the solid fill for primary buttons in light mode (white text on
  `brand-700` is only ~4.27:1, below WCAG AA for normal text; `brand-800` lifts
  it to ~6.43:1). In dark mode the button flips back to the bright `brand-700`
  fill, which carries dark `ink-50` text at ~6.9:1.
- **700** — the bright solid fill for primary buttons in dark mode (and the
  brand ink for the mono `.eyebrow` label on the page background).
- **600** — links and icons.
- **900** — darkest step; primary-button hover in light mode (~8.95:1).
- **50–100** — soft tints behind spec chips and badges.

White text on a brand fill only clears AA (4.5:1) from `brand-800` down in light
mode, so solid brand surfaces that carry white/near-white text (primary buttons,
the chat header, own-message bubbles) use `brand-800` in light and keep the
bright `brand-600`/`brand-700` fills only in dark mode, where the dark text
inverts the contrast.

### Ink — cool steel / graphite neutrals

A 50–900 ramp used for surfaces, borders and text:

- **50** — light steel page background (`body` background).
- **200 / 300** — panel borders and hairlines.
- **400** — muted icons / faint grid lines.
- **500 / 600** — muted body copy.
- **900** — graphite for primary text and dark technical sections.

### Surface

- `--color-surface` — the raised surface color (white cards in light mode). Use
  `bg-surface` for cards, inputs and panels rather than a hard-coded white so
  they invert correctly in dark mode.

## Light / dark theme

Dark mode is **class-based**: the `dark` class is set on `<html>` by the server
layout (from an explicit `theme` cookie) or by an inline no-flash script in
`<head>` (system preference when no cookie is set). The `@custom-variant dark`
rule targets `.dark`, and `ThemeToggle` (`src/components/ThemeToggle.tsx`) lets
users switch.

Components are written against the **semantic** `ink` / `brand` / `surface`
tokens, so the theme flips at the token layer instead of via per-component
`dark:` overrides:

- The **ink ramp inverts** — `ink-50` stays "page background", `ink-900` stays
  "primary text", so component classes don't change.
- **`surface`** swaps white cards for a raised dark surface.
- The **brand ramp is re-tuned per role**: tints (50–200) become deep warm
  fills, text shades (600/800/900) become light, and the solid fill (700)
  becomes a bright orange that carries dark text (hence `dark:text-ink-50` on
  buttons).
- The handful of status shades in use (`emerald` / `amber` / `red` chips,
  banners, toasts) are re-mapped the same way so per-component `dark:`
  overrides stay rare.

When adding UI, reach for the semantic tokens; only add a `dark:` override for
something the token layer can't express.

## Typography

Three font stacks, all defined as `@theme` tokens:

- `--font-sans` — `--font-plex-sans`, then `"FM Bindumathi"`,
  `--font-sinhala`, then system fallbacks. Used for body text.
- `--font-display` — same stack as sans; applied to `h1`–`h3` (which also get
  `text-wrap: balance` and tight letter-spacing).
- `--font-mono` — `--font-plex-mono`, then `ui-monospace` / SF Mono. Used for
  spec labels, eyebrows and the "instrument" stat readouts.

**Sinhala:** the app is bilingual (EN/සිං). An optional `@font-face` picks up
`public/fonts/FMBindumathi.woff2` for Sinhala text (scoped to the Sinhala
Unicode range `U+0D80–0DFF`); if the file is missing it falls back to Noto Sans
Sinhala automatically. Only a Unicode-encoded font works — the legacy
FM-Bindumathi has no Sinhala Unicode glyphs.

## Motion

- **Easing curves:** `--ease-snap` (`cubic-bezier(0.23, 1, 0.32, 1)`) for quick
  settles and `--ease-flow` (`cubic-bezier(0.77, 0, 0.175, 1)`) for longer
  moves. Exposed as `ease-snap` / `ease-flow` Tailwind utilities.
- Reusable animation classes live in `globals.css`: `.rise` (staggered entrance
  via `--rise-index`), `.reveal-js` / `.stagger` (scroll-reveal, toggled by the
  `InView` component), plus the home-hero set (`.roll-word`, `.orbit-ring`,
  `.orbit-chip`, `.ticker-track`, `.floaty`, `.pulse-dot`) and photo effects
  (`.kenburns`, `.scan-line`).
- **Home hero slider** (`HeroSlider`, `src/components/HeroSlider.tsx`, #447):
  the hero's photo plate crossfades through four worker photos from
  `public/images/workers/` (5 s per slide, Ken Burns drift on the active
  slide), with a localized caption plus keyboard-accessible prev/next and dot
  controls in the figcaption bar. Rotation pauses on hover/focus-within and is
  disabled under `prefers-reduced-motion`; only the active slide is exposed to
  assistive tech (`aria-roledescription="carousel"` / `"slide"`, the caption
  announced politely only while rotation is stopped). The first slide uses
  `next/image`'s `preload` so the LCP image behaves like the old static photo;
  the rest lazy-load.
- Everything is guarded by `prefers-reduced-motion: reduce`, which cancels the
  animations and transitions.

## Component utility classes (`@layer components`)

Shared class-level primitives, applied directly in markup:

- `.input`, `.label` — form control + label styling.
- `.btn-primary`, `.btn-secondary`, `.btn-ghost` — button variants.
- `.card` — bordered `bg-surface` panel with a soft shadow.
- `.chip` — small pill for tags/badges.

Blueprint toolkit helpers: `.eyebrow` (mono uppercase spec label),
`.blueprint-grid` (graph-paper background band), `.tech-corners` (drafting
corner brackets on a panel), `.hazard` (animated caution stripes), `.hairline`
(steel hairline rule).

## Shared UI primitives (`src/components/ui/`)

The "UI 2.0" registry-style primitives extracted from the redesign. Prefer
composing these over re-implementing the markup. All are server-safe (no
interactivity of their own):

- **`PageHeader`** — the blueprint-grid header band: a mono uppercase eyebrow
  (with an optional solid `bg-brand-700` `tag`), an `h1` title, an optional
  `pulse-dot` status line, and an optional right-aligned slot (often a
  `StatReadout`).
- **`StatReadout`** — a horizontal `dl` of `tech-corners` panels, each a big
  `font-mono` `tabular-nums` figure over a mono uppercase caption. Numeric
  values are zero-padded (default width 2) for the fixed-width instrument look.
- **`EmptyState`** — the centered `.card` for empty listings/panels: a large
  muted icon (from `@/components/icons`), a title, a body line, an optional
  action, and an optional `children` slot.
- **`Field`** (and its sibling `FormRow`) — form-field scaffolding pairing a
  `.label` with a control plus optional help/error text (error takes
  precedence and is announced via `role="alert"`). `FormRow` lays 2–3 `Field`s
  side by side (single column on mobile).
