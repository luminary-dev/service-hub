# Bilingual EN/SI & theme


### Languages

The app is fully bilingual English/Sinhala. All UI strings live in
`src/lib/i18n.ts` (`Locale = "en" | "si"`), with helper localizers for category,
district, and price-type labels. The one exception is the long-form legal copy
for `/terms` and `/privacy` (#62), which lives in `src/lib/legal.ts` so it is
only loaded server-side instead of shipping in the client dict; its EN/SI
structural parity is guarded by `src/lib/legal.test.ts` the same way
`i18n.test.ts` guards the dict.

- **`/si` routing.** `src/proxy.ts` matches `/si` and `/si/*`, rewrites to the
  same path minus the `/si` prefix (keeping a single route tree), and sets an
  `x-locale: si` request header. The browser URL stays `/si/...`.
- **Locale detection.** `getLocale()` returns `si` when the request came through
  `/si`, else falls back to the `lang` cookie, else `en`.
- **Language toggle** — writes the `lang` cookie (1-year) and navigates to the
  localized URL. `generateMetadata` emits hreflang alternates (`en`, `si`,
  `x-default`), and pages with a canonical emit a matching `og:url` via
  `siteOpenGraph()` (`src/lib/seo.ts`); `og:locale` follows the URL locale, not
  the cookie (#379). `robots.txt` disallows the private areas in both URL
  spaces (`/dashboard`, `/admin`, `/account` and their `/si/*` twins), and the
  root metadata files 404 under `/si` rather than serving duplicates.
- **Locale-preserving links.** Every internal `href`, server `redirect()`, and
  client `router.push` on the user-facing surface routes through
  `localizedHref(path, locale)` (locale from `getLocale()` on the server,
  `useLocale()` in client components), so a visitor under `/si/*` stays in the
  `/si` URL space as they navigate — including post-auth pushes. Signed-out
  gates redirect via `loginNext(path)` (`src/lib/login.ts`), which keeps both
  the `/login` URL and its `?next=` return-to (#560) in the visitor's locale
  space. The admin console is the deliberate exception: navigation within
  `/admin/*` stays unlocalized. A guard test (`src/lib/links-guard.test.ts`)
  scans the sources and fails on any literal root-path navigation outside
  `/admin`, so regressions can't land.

### Theme

Light/dark theme (`src/lib/theme.ts`, `ThemeToggle`), default light. The choice
is stored in a `theme` cookie (1-year) and read server-side so SSR and hydration
agree; toggling flips the `dark` class on `<html>` and refreshes. Charts and
badges derive their colors from CSS variables so they follow the theme.

---

