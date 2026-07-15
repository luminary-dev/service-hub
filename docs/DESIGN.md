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
  `.orbit-chip`, `.ticker-track`, `.floaty`, `.pulse-dot`), photo effects
  (`.kenburns`, `.scan-line`) and the hero-slider set (`.hero-float`,
  `.hero-sweep`, `.hero-rise`, `.hero-tick-active`).
- **Hero slider** (`HeroSlider`, home page right column): the framed technical
  plate is a self-advancing trade carousel. Layered motion, all on-theme:
  - `.hero-float` — the whole plate drifts on a slow 11s x+y sway (a smooth
    "flowing" motion, not a bob).
  - Per slide: a **cross-fade + push-in zoom** (`scale 1.05→1`) over the
    ongoing per-slide `.kenburns` drift.
  - `.hero-sweep` — a brand scan-line wipes across on each change.
  - `.hero-rise` — the trade badge, live counter and `Fig.0N` caption rise in
    on each change (keyed remount replays the animation).
  - `.hero-tick-active` — a soft brand halo breathes behind the active tick;
    an rAF-driven gauge fills across the bottom edge in sync with auto-advance.
  - Controls: prev/next (nudge on hover), a segmented tick selector, arrow-key
    nav, an explicit pause/play toggle (the WCAG 2.2.2 stop mechanism), and
    pause on hover/focus. Same `aspect-[4/5]` plate (no layout shift); the first
    slide is `preload`ed (Next 16's replacement for the deprecated `priority`)
    for LCP.
- Everything is guarded by `prefers-reduced-motion: reduce`, which cancels the
  animations and transitions. The slider additionally halts auto-advance and all
  its motion under reduced motion (via `useSyncExternalStore` on the media
  query) — it becomes a static, manually-navigable plate.

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
interactivity of their own) except `Dialog` and `RouteError`, which are client
components:

- **`PageHeader`** — the blueprint-grid header band: a mono uppercase eyebrow
  (with an optional solid `bg-brand-700` `tag`), an `h1` title, an optional
  `pulse-dot` status line, and an optional right-aligned slot (often a
  `StatReadout`).
- **`StatReadout`** — a horizontal `dl` of `tech-corners` panels, each a big
  `font-mono` `tabular-nums` figure over a mono uppercase caption. Numeric
  values are zero-padded (default width 2) for the fixed-width instrument look.
  Pass `wrap` to reflow the row into an even 2-column grid on mobile (used on
  the provider dashboard, where four instruments would otherwise overflow a
  ~390px viewport) — it falls back to the horizontal row from `sm` up.
- **`EmptyState`** — the centered `.card` for empty listings/panels: a large
  muted icon (from `@/components/icons`), a title, a body line, an optional
  action, and an optional `children` slot.
- **`Field`** (and its sibling `FormRow`) — form-field scaffolding pairing a
  `.label` with a control plus optional help/error text (error takes
  precedence and is announced via `role="alert"`). `FormRow` lays 2–3 `Field`s
  side by side (single column on mobile).
- **`FormError` / `ErrorSummary` / `useFieldErrors`** (one module,
  `FormError.tsx`) — inline field-error text wired to its control via
  `aria-describedby`/`aria-invalid`, the focus-managed top-of-form
  `ErrorSummary` linking to the offending fields, and the hook that keeps the
  per-field error map (and moves focus to the first invalid control) behind
  both (#378 — the failure-side counterpart of `FormSuccess`).
- **`Dialog`** (client) — the one modal implementation: fixed overlay, focus
  trap, scroll lock, Escape-to-close, initial-focus + focus-restore. Render it
  only while open (`{open && <Dialog …>}`). Panel mode (`panelClassName`)
  centers a `role="dialog"` panel whose inner clicks don't close (the report
  modal); bare mode puts the dialog role on the overlay itself (the photo
  lightbox). `isolate` stops Escape/click/touch from reaching a dialog
  underneath when modals stack. Never hand-roll `aria-modal` markup — compose
  this.
- **`Skeleton` / `SkeletonList`** — loading placeholders for `loading.tsx`
  files and in-component fetch states. `Skeleton` is one shimmer block
  (`tone="strong"` → `bg-ink-200` for headings/avatars, default soft →
  `bg-ink-100`; shape via `className`); the nearest container carries
  `animate-pulse` so card borders shimmer too. `SkeletonList` is the standard
  card-row list (avatar, two lines, trailing pill).
- **`Pagination`** — the prev/next pager under paginated listings: a labelled
  `<nav>` landmark, `.btn-secondary` links around a "Page X of Y" readout,
  hidden on single-page results. Callers build hrefs (`hrefFor`) so filters
  and the `/si` locale prefix are preserved; pass `label` when one page hosts
  two pagers (the jobs board).
- **`RouteError`** (client) — the shared error-boundary UI (icon, localized
  message, retry + go-home). Every `error.tsx` re-exports it.

## Route states & feedback conventions

- **Loading:** every data-fetching route segment has a `loading.tsx` composed
  from `Skeleton`/`SkeletonList` that mirrors the page's real layout. Nested
  segments with their own shape (e.g. the inquiry message threads) get their
  own file so navigation doesn't flash the parent's skeleton.
- **Errors:** `error.tsx` boundaries exist at the root and at the `account/`,
  `dashboard/`, `admin/` and `providers/[id]/` segments (all re-exporting
  `RouteError`), so a throw retries in place with the surrounding layout
  intact instead of bubbling to the global boundary.
- **Empty states:** anything with nothing to show renders `EmptyState` — no
  bare `.card` divs or lone paragraphs.
- **Form success:** a terminal success replaces the form with `FormSuccess`
  (`role="status"` + focus moved to the heading, #510/#543); background
  actions that keep the page (saves, deletes, reports) confirm via
  `ToastProvider` toasts; redirect only when the flow genuinely moves
  (e.g. login). Don't mix patterns within one form.
