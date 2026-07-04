import { cookies, headers } from "next/headers";
import type { Locale } from "./i18n";
import { LOCALE_HEADER } from "./links";

// UI locale. The /si URL prefix wins (indexable localized URLs, #67); the
// `lang` cookie remains the fallback for unprefixed URLs, so all existing
// English-root URLs keep behaving exactly as before for cookie users.
export async function getLocale(): Promise<Locale> {
  if ((await getUrlLocale()) === "si") return "si";
  const value = (await cookies()).get("lang")?.value;
  return value === "si" ? "si" : "en";
}

// URL locale: "si" only when the request came through the /si prefix.
// Unlike getLocale() this ignores the cookie — use it for canonical /
// hreflang URLs, which must describe the URL being served, not the
// viewer's language preference.
export async function getUrlLocale(): Promise<Locale> {
  return (await headers()).get(LOCALE_HEADER) === "si" ? "si" : "en";
}
