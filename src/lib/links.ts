import type { Metadata } from "next";
import type { Locale } from "./i18n";

// Locale-prefixed URLs (#67): English is canonical at the root
// (baas.lk/providers), Sinhala lives under /si (baas.lk/si/providers).
// This module is client-safe (no next/headers) so both server components
// and client components can build locale-aware hrefs.

const SI_PREFIX = "/si";

// Request header set by src/proxy.ts for /si-prefixed URLs and read by
// src/lib/locale.ts. Lives here (not locale.ts) so proxy.ts doesn't pull
// next/headers into the proxy bundle.
export const LOCALE_HEADER = "x-locale";

// Returns "si" when a pathname sits under the /si URL prefix.
export function pathLocale(pathname: string): Locale {
  return pathname === SI_PREFIX || pathname.startsWith(`${SI_PREFIX}/`)
    ? "si"
    : "en";
}

// Renders an app path (optionally carrying ?query/#hash) in the given
// locale's URL space: localizedHref("/providers?page=2", "si") →
// "/si/providers?page=2"; localizedHref("/si/providers", "en") →
// "/providers". Idempotent for already-prefixed paths.
export function localizedHref(path: string, locale: Locale): string {
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const suffix = cut === -1 ? "" : path.slice(cut);
  const bare =
    pathname === SI_PREFIX
      ? "/"
      : pathname.startsWith(`${SI_PREFIX}/`)
        ? pathname.slice(SI_PREFIX.length)
        : pathname;
  if (locale !== "si") return bare + suffix;
  return (bare === "/" ? SI_PREFIX : `${SI_PREFIX}${bare}`) + suffix;
}

// Post-login return-to (#560). Only a same-origin relative path survives a
// round-trip through ?next= — never a scheme/host, a protocol-relative
// "//evil.com", or a backslash variant URL parsers normalize to "//".
// Mirrors identity-service's sanitizeNext (routes/oauth.ts), plus the
// backslash rejection because this value feeds router.push().
export function sanitizeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/")) return null;
  if (next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

// /login URL carrying the (already locale-prefixed) path to return to after
// sign-in. The login page validates it with sanitizeNext before use.
export function loginNextHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

// hreflang alternates for a public page, given its unprefixed path. Each
// language version is its own canonical; x-default points at the English
// root. Paths are relative — metadataBase (root layout) makes them absolute.
export function languageAlternates(
  path: string,
  urlLocale: Locale,
): Metadata["alternates"] {
  const en = localizedHref(path, "en");
  const si = localizedHref(path, "si");
  return {
    canonical: urlLocale === "si" ? si : en,
    languages: { en, si, "x-default": en },
  };
}
