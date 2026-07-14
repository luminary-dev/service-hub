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
  `x-locale: si` request header. The browser URL stays `/si/...`. The proxy
  *owns* that header: on every other (English-root) page route it overwrites
  any client-forgeable `x-locale` and pins it to `en`, so the URL — not the
  header — is the authoritative locale.
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

### Guarding against hardcoded strings

A static lint keeps untranslated copy out of the UI (#672, guarding the
#566-class regressions as more locales land). `eslint.config.mjs` wires
`eslint-plugin-i18next`'s `no-literal-string` rule at **error** over
`src/app/**/*.tsx` and `src/components/**/*.tsx`, so any visible JSX text that
isn't routed through the dictionary fails `npm run lint` (and CI). It runs in
the plugin's default `jsx-text-only` mode — it flags plain text **between** JSX
tags, not `className`/prop/technical literals — which catches visible copy
without drowning the run in false positives. Attribute copy
(`alt`/`placeholder`/`aria-label`) is deliberately out of scope for now to
avoid noise from custom-component props; a follow-up can ratchet to `jsx-only`.

When the rule fires, the fix is almost always to move the string into
`src/lib/i18n.ts` (EN **and** SI — the `si` dict is typed as `typeof en`, and
`i18n.test.ts` guards parity) and render it via `dict[locale]`. The config's
`words.exclude` list carves out the few genuinely non-translatable literals —
the `Baas.lk`/`WhatsApp`/`OpenStreetMap` brand tokens and the decorative
"technical dossier" spec codes (`AUTH-01`, `REG-P / PRO`, …) that read the same
in every locale. The top-level crash boundary (`global-error.tsx`, which
renders before the i18n providers exist) and the generated OG images
(`opengraph-image.tsx`, canonical English social cards) are excluded by path.
Do **not** silence a real violation with a blanket disable — translate it.

### Theme

Light/dark theme (`src/lib/theme.ts`, `ThemeToggle`), default light. The choice
is stored in a `theme` cookie (1-year) and read server-side so SSR and hydration
agree; toggling flips the `dark` class on `<html>` and refreshes. Charts and
badges derive their colors from CSS variables so they follow the theme.

---

