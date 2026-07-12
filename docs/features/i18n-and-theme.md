# Bilingual EN/SI & theme


### Languages

The app is fully bilingual English/Sinhala. All UI strings live in
`src/lib/i18n.ts` (`Locale = "en" | "si"`), with helper localizers for category,
district, and price-type labels.

- **`/si` routing.** `src/proxy.ts` matches `/si` and `/si/*`, rewrites to the
  same path minus the `/si` prefix (keeping a single route tree), and sets an
  `x-locale: si` request header. The browser URL stays `/si/...`.
- **Locale detection.** `getLocale()` returns `si` when the request came through
  `/si`, else falls back to the `lang` cookie, else `en`.
- **Language toggle** — writes the `lang` cookie (1-year) and navigates to the
  localized URL. `generateMetadata` emits hreflang alternates (`en`, `si`,
  `x-default`).
- **Locale-preserving links.** Internal nav, auth, and error-boundary links (and
  their `router.push` redirects) route through `localizedHref(path, locale)`, so
  a visitor under `/si/*` stays in the `/si` URL space as they navigate.

### Theme

Light/dark theme (`src/lib/theme.ts`, `ThemeToggle`), default light. The choice
is stored in a `theme` cookie (1-year) and read server-side so SSR and hydration
agree; toggling flips the `dark` class on `<html>` and refreshes. Charts and
badges derive their colors from CSS variables so they follow the theme.

---

