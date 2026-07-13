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
- **Locale-preserving links.** Every internal `href`, server `redirect()`, and
  client `router.push` on the user-facing surface routes through
  `localizedHref(path, locale)` (locale from `getLocale()` on the server,
  `useLocale()` in client components), so a visitor under `/si/*` stays in the
  `/si` URL space as they navigate — including login redirects and post-auth
  pushes. The admin console is the deliberate exception: navigation within
  `/admin/*` stays unlocalized. A guard test
  (`src/lib/links-guard.test.ts`) scans the sources and fails on any literal
  root-path navigation outside `/admin`, so regressions can't land.

### Theme

Light/dark theme (`src/lib/theme.ts`, `ThemeToggle`), default light. The choice
is stored in a `theme` cookie (1-year) and read server-side so SSR and hydration
agree; toggling flips the `dark` class on `<html>` and refreshes. Charts and
badges derive their colors from CSS variables so they follow the theme.

---

